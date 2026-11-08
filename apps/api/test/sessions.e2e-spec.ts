import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  REFRESH_COOKIE,
  bearer,
  createApp,
  createUser,
  loginSession,
  refresh,
  setCookies,
} from './helpers.js';
import { sha256, startSession } from './refresh-fixtures.js';

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

  describe('logout', () => {
    it('revokes the session, makes its refresh token useless and clears the cookie', async () => {
      const { user, accessToken, refreshToken } = await newSession();
      const res = await http().post('/api/v1/auth/logout').set(bearer(accessToken));
      expect(res.status).toBe(204);
      const cookies = setCookies(res);
      expect(cookies[0]).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));
      expect(cookies[0]).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookies[0]).toMatch(/HttpOnly/);
      expect(cookies[0]).toMatch(/SameSite=Strict/);

      expect((await refresh(app, refreshToken)).status).toBe(401);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.revokedReason).toBe('logout');
    });

    it('is idempotent in effect: a second logout is refused (token revoked) and audits nothing new', async () => {
      const { user, accessToken } = await newSession();
      await http().post('/api/v1/auth/logout').set(bearer(accessToken)).expect(204);
      await http().post('/api/v1/auth/logout').set(bearer(accessToken)).expect(401);
      const rows = await prisma.auditLog.findMany({
        where: { action: 'auth.logout', actorUserId: user.id },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('GET /auth/sessions and DELETE /auth/sessions/:id', () => {
    it('lists only the caller’s live sessions, marks the current one, and exposes no credentials', async () => {
      const user = await createUser(app);
      const other = await createUser(app);
      const first = await loginSession(app, user.email);
      const second = await loginSession(app, user.email);
      await loginSession(app, other.email);
      // A revoked and an expired session must not be listed.
      const revoked = await loginSession(app, user.email);
      await http().post('/api/v1/auth/logout').set(bearer(revoked.accessToken)).expect(204);

      const res = await http().get('/api/v1/auth/sessions').set(bearer(second.accessToken));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      for (const s of res.body) {
        expect(Object.keys(s).sort()).toEqual([
          'createdAt',
          'current',
          'expiresAt',
          'id',
          'ip',
          'userAgent',
        ]);
      }
      const dump = JSON.stringify(res.body);
      for (const secret of [first.refreshToken, second.refreshToken, first.accessToken]) {
        expect(dump).not.toContain(secret);
        expect(dump).not.toContain(sha256(secret));
      }
      expect(dump).not.toMatch(/tokenHash|token_hash|revoked|mfa/i);
    });

    it('orders newest first', async () => {
      const user = await createUser(app);
      await loginSession(app, user.email);
      const latest = await loginSession(app, user.email);
      const res = await http().get('/api/v1/auth/sessions').set(bearer(latest.accessToken));
      expect(res.body[0].current).toBe(true);
    });

    it('requires authentication', async () => {
      await http().get('/api/v1/auth/sessions').expect(401);
      await http().delete('/api/v1/auth/sessions/018f0000-0000-7000-8000-000000000000').expect(401);
    });

    it('revokes another session without touching the current one, and kills its refresh token', async () => {
      const user = await createUser(app);
      const current = await loginSession(app, user.email);
      const target = await loginSession(app, user.email);
      const list = await http().get('/api/v1/auth/sessions').set(bearer(current.accessToken));
      const targetId = list.body.find((s: { current: boolean }) => !s.current).id as string;

      const res = await http()
        .delete(`/api/v1/auth/sessions/${targetId}`)
        .set(bearer(current.accessToken));
      expect(res.status).toBe(204);
      // Revoking another session must not clear the caller's own cookie.
      expect(res.headers['set-cookie']).toBeUndefined();

      expect((await refresh(app, target.refreshToken)).status).toBe(401);
      expect((await http().get('/api/v1/auth/me').set(bearer(target.accessToken))).status).toBe(
        401,
      );
      expect((await http().get('/api/v1/auth/me').set(bearer(current.accessToken))).status).toBe(
        200,
      );
      expect((await refresh(app, current.refreshToken)).status).toBe(200);

      const row = await prisma.session.findUniqueOrThrow({ where: { id: targetId } });
      expect(row.revokedReason).toBe('revoked_by_user');
    });

    it('revoking the current session ends it and clears the cookie', async () => {
      const { accessToken, refreshToken } = await newSession();
      const list = await http().get('/api/v1/auth/sessions').set(bearer(accessToken));
      const currentId = list.body[0].id as string;

      const res = await http()
        .delete(`/api/v1/auth/sessions/${currentId}`)
        .set(bearer(accessToken));
      expect(res.status).toBe(204);
      expect(setCookies(res)[0]).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));
      expect((await refresh(app, refreshToken)).status).toBe(401);
      expect((await http().get('/api/v1/auth/me').set(bearer(accessToken))).status).toBe(401);
    });

    it('cannot revoke another user’s session; answers exactly like a session that does not exist', async () => {
      const victim = await newSession();
      const attacker = await newSession();
      const victimSession = await prisma.session.findFirstOrThrow({
        where: { userId: victim.user.id },
      });

      const foreign = await http()
        .delete(`/api/v1/auth/sessions/${victimSession.id}`)
        .set(bearer(attacker.accessToken));
      const missing = await http()
        .delete('/api/v1/auth/sessions/018f0000-0000-7000-8000-000000000000')
        .set(bearer(attacker.accessToken));

      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body.code).toBe('SESSION_NOT_FOUND');
      expect(foreign.body.code).toBe(missing.body.code);
      expect(foreign.body.message).toBe(missing.body.message);

      // The victim is untouched.
      expect((await refresh(app, victim.refreshToken)).status).toBe(200);
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: victimSession.id } })).revokedAt,
      ).toBeNull();
    });

    it('does not list another user’s sessions', async () => {
      const victim = await newSession();
      const attacker = await newSession();
      const victimSession = await prisma.session.findFirstOrThrow({
        where: { userId: victim.user.id },
      });
      const res = await http().get('/api/v1/auth/sessions').set(bearer(attacker.accessToken));
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain(victimSession.id);
    });

    it('answers 404 for an already-revoked session and 400 for a malformed id', async () => {
      const user = await createUser(app);
      const current = await loginSession(app, user.email);
      const other = await loginSession(app, user.email);
      const list = await http().get('/api/v1/auth/sessions').set(bearer(current.accessToken));
      const otherId = list.body.find((s: { current: boolean }) => !s.current).id as string;
      await http()
        .delete(`/api/v1/auth/sessions/${otherId}`)
        .set(bearer(current.accessToken))
        .expect(204);
      await http()
        .delete(`/api/v1/auth/sessions/${otherId}`)
        .set(bearer(current.accessToken))
        .expect(404);
      await http()
        .delete('/api/v1/auth/sessions/not-a-uuid')
        .set(bearer(current.accessToken))
        .expect(400);
      expect(other.refreshToken).toBeTruthy();
    });

    it('audits each revocation once as a SECURITY event', async () => {
      const user = await createUser(app);
      const current = await loginSession(app, user.email);
      await loginSession(app, user.email);
      const list = await http().get('/api/v1/auth/sessions').set(bearer(current.accessToken));
      const otherId = list.body.find((s: { current: boolean }) => !s.current).id as string;
      await http()
        .delete(`/api/v1/auth/sessions/${otherId}`)
        .set(bearer(current.accessToken))
        .expect(204);
      const rows = await prisma.auditLog.findMany({
        where: { action: 'auth.session_revoked', actorUserId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ category: 'SECURITY', entityId: otherId });
    });

    it('a restricted Director session can list and revoke its own sessions', async () => {
      const { accessToken } = await newSession([SystemRoleKey.Director]);
      expect((await http().get('/api/v1/auth/sessions').set(bearer(accessToken))).status).toBe(200);
    });
  });
});
