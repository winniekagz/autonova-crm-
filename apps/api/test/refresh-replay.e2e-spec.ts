import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bearer,
  createApp,
  createUser,
  loginSession,
  refresh,
  refreshTokenFrom,
  requireRefreshToken,
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

  describe('POST /auth/refresh', () => {
    describe('replay detection', () => {
      it('reusing a rotated token is refused and revokes the session, including the new token', async () => {
        const { user, accessToken, refreshToken } = await newSession();
        const first = await refresh(app, refreshToken);
        expect(first.status).toBe(200);
        const successor = requireRefreshToken(first);

        const replay = await refresh(app, refreshToken);
        expect(replay.status).toBe(401);
        expect(replay.body.code).toBe('REFRESH_TOKEN_INVALID');

        // The legitimate holder of the successor is signed out too: the session is gone.
        expect((await refresh(app, successor)).status).toBe(401);
        expect(
          (await http().get('/api/v1/auth/me').set(bearer(first.body.accessToken))).status,
        ).toBe(401);
        expect((await http().get('/api/v1/auth/me').set(bearer(accessToken))).status).toBe(401);

        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        expect(session.revokedAt).not.toBeNull();
        expect(session.revokedReason).toBe('refresh_reuse');
      });

      it('audits the replay once as a SECURITY event without any token material', async () => {
        const { user, refreshToken } = await newSession();
        await refresh(app, refreshToken).expect(200);
        await refresh(app, refreshToken).expect(401);

        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        const rows = await prisma.auditLog.findMany({
          where: { action: 'auth.refresh_reuse_detected', entityId: session.id },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ category: 'SECURITY', actorUserId: user.id });
        expect(JSON.stringify(rows)).not.toContain(refreshToken);
        expect(JSON.stringify(rows)).not.toContain(sha256(refreshToken));
      });

      it('has no grace period: an immediate second use is already replay', async () => {
        const { user, refreshToken } = await newSession();
        await refresh(app, refreshToken).expect(200);
        const second = await refresh(app, refreshToken);
        expect(second.status).toBe(401);
        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        expect(session.revokedAt).not.toBeNull();
      });

      it('replay of a token on a session that was revoked does not break anything further', async () => {
        const { refreshToken } = await newSession();
        await refresh(app, refreshToken).expect(200);
        await refresh(app, refreshToken).expect(401);
        await refresh(app, refreshToken).expect(401);
      });

      it('only affects the compromised session, not the same user’s other sessions', async () => {
        const user = await createUser(app);
        const a = await loginSession(app, user.email);
        const b = await loginSession(app, user.email);
        await refresh(app, a.refreshToken).expect(200);
        await refresh(app, a.refreshToken).expect(401);
        expect((await refresh(app, b.refreshToken)).status).toBe(200);
      });
    });

    describe('concurrency (real database)', () => {
      it('of N simultaneous requests with the same token, exactly one succeeds', async () => {
        const { user, refreshToken } = await newSession();
        const results = await Promise.all(
          Array.from({ length: 12 }, () => refresh(app, refreshToken)),
        );
        const ok = results.filter((r) => r.status === 200);
        const rejected = results.filter((r) => r.status === 401);
        expect(ok).toHaveLength(1);
        expect(rejected).toHaveLength(11);

        // Exactly one successor exists, and only the winner got a cookie.
        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        const tokens = await prisma.refreshToken.findMany({ where: { sessionId: session.id } });
        expect(tokens).toHaveLength(2);
        expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
        expect(results.filter((r) => refreshTokenFrom(r) !== null)).toHaveLength(1);

        // The losers presented a spent token, which is replay: the session ends.
        expect(
          (await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
        ).not.toBeNull();
      });

      it('repeats reliably across many rounds', async () => {
        for (let round = 0; round < 5; round++) {
          const { refreshToken } = await newSession();
          const results = await Promise.all([
            refresh(app, refreshToken),
            refresh(app, refreshToken),
            refresh(app, refreshToken),
          ]);
          expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        }
      });

      it('the database itself refuses a second live token for a session', async () => {
        const { user } = await newSession();
        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        await expect(
          prisma.refreshToken.create({
            data: {
              sessionId: session.id,
              tokenHash: sha256('another'),
              expiresAt: new Date(Date.now() + 60_000),
            },
          }),
        ).rejects.toThrow();
      });
    });
  });
});
