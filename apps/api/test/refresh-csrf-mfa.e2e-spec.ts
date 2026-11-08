import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WEB_ORIGIN, bearer, createApp, refresh } from './helpers.js';
import { startSession } from './refresh-fixtures.js';

describe('refresh tokens: rotation, replay, CSRF, session management (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp({ withProbe: true });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const newSession = (roles?: string[]) => startSession(app, roles);

  describe('POST /auth/refresh', () => {
    describe('CSRF and origin protection', () => {
      it('rejects a foreign Origin, even with a valid token, and does not consume the token', async () => {
        const { refreshToken } = await newSession();
        const res = await refresh(app, refreshToken, { origin: 'https://evil.example' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_REJECTED');
        // A forged request must not sign the user out or spend their token.
        expect(res.headers['set-cookie']).toBeUndefined();
        expect((await refresh(app, refreshToken)).status).toBe(200);
      });

      it('rejects a missing Origin', async () => {
        const { refreshToken } = await newSession();
        const res = await refresh(app, refreshToken, { origin: null });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_REJECTED');
      });

      it('rejects a missing CSRF header', async () => {
        const { refreshToken } = await newSession();
        const res = await refresh(app, refreshToken, { csrf: null });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_REJECTED');
        expect(res.headers['set-cookie']).toBeUndefined();
      });

      it.each(['0', 'true', '', '11'])('rejects the CSRF header value %j', async (csrf) => {
        const { refreshToken } = await newSession();
        const res = await refresh(app, refreshToken, { csrf });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_REJECTED');
      });

      it('rejects a lookalike origin', async () => {
        const { refreshToken } = await newSession();
        const res = await refresh(app, refreshToken, { origin: `${WEB_ORIGIN}.evil.example` });
        expect(res.status).toBe(403);
      });

      it('answers the CORS preflight only for allowed origins and allows the custom header', async () => {
        const ok = await http()
          .options('/api/v1/auth/refresh')
          .set('origin', WEB_ORIGIN)
          .set('access-control-request-method', 'POST')
          .set('access-control-request-headers', 'x-autonova-csrf');
        expect(ok.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
        expect(ok.headers['access-control-allow-credentials']).toBe('true');
        expect(String(ok.headers['access-control-allow-headers']).toLowerCase()).toContain(
          'x-autonova-csrf',
        );

        const bad = await http()
          .options('/api/v1/auth/refresh')
          .set('origin', 'https://evil.example')
          .set('access-control-request-method', 'POST')
          .set('access-control-request-headers', 'x-autonova-csrf');
        expect(bad.headers['access-control-allow-origin']).toBeUndefined();
      });

      it('never reflects a wildcard origin together with credentials', async () => {
        const res = await refresh(app, null);
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      });
    });

    describe('Director MFA', () => {
      it('a refresh keeps an unverified Director session restricted', async () => {
        const { user, refreshToken } = await newSession([SystemRoleKey.Director]);
        const res = await refresh(app, refreshToken);
        expect(res.status).toBe(200);
        expect(res.body.mfaRequired).toBe(true);

        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        expect(session.mfaVerifiedAt).toBeNull();

        const me = await http().get('/api/v1/auth/me').set(bearer(res.body.accessToken));
        expect(me.body).toMatchObject({
          restricted: true,
          mfa: { required: true, verified: false },
        });
        const blocked = await http().get('/api/v1/test-probe').set(bearer(res.body.accessToken));
        expect(blocked.status).toBe(403);
        expect(blocked.body.code).toBe('MFA_REQUIRED');
      });

      it('a refresh preserves (and never grants) MFA verification on a verified session', async () => {
        const { user, refreshToken } = await newSession([SystemRoleKey.Director]);
        const verifiedAt = new Date();
        await prisma.session.updateMany({
          where: { userId: user.id },
          data: { mfaVerifiedAt: verifiedAt },
        });
        const res = await refresh(app, refreshToken);
        expect(res.status).toBe(200);
        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        expect(session.mfaVerifiedAt).toEqual(verifiedAt);
        expect(
          (await http().get('/api/v1/test-probe').set(bearer(res.body.accessToken))).status,
        ).toBe(200);
      });
    });
  });
});
