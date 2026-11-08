import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  REFRESH_COOKIE,
  bearer,
  createApp,
  createUser,
  login,
  refresh,
  refreshTokenFrom,
  requireRefreshToken,
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

  describe('login issues the refresh cookie', () => {
    it('sets an HttpOnly, SameSite=Strict cookie scoped to /api/v1/auth, without a Domain', async () => {
      const { response } = await newSession();
      const [cookie] = setCookies(response);
      expect(cookie).toMatch(new RegExp(`^${REFRESH_COOKIE}=[A-Za-z0-9_-]{43};`));
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; SameSite=Strict/);
      expect(cookie).toMatch(/; Expires=/);
      expect(cookie).not.toMatch(/Domain=/i);
      // NODE_ENV=test is plain http; production adds Secure (covered by the unit test below).
    });

    it('stores only the SHA-256 hash of the token, never the token', async () => {
      const { user, refreshToken } = await newSession();
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      const rows = await prisma.refreshToken.findMany({ where: { sessionId: session.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(sha256(refreshToken));
      expect(JSON.stringify(rows)).not.toContain(refreshToken);
      expect(rows[0]?.usedAt).toBeNull();
      expect(rows[0]?.expiresAt.getTime()).toBeLessThanOrEqual(session.expiresAt.getTime());
    });

    it('does not create a token for a failed login', async () => {
      const user = await createUser(app);
      const before = await prisma.refreshToken.count();
      const res = await login(app, user.email, 'wrong password entirely');
      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await prisma.refreshToken.count()).toBe(before);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates: returns a new access token and a new cookie, and the old token is spent', async () => {
      const { user, accessToken, refreshToken } = await newSession();

      const res = await refresh(app, refreshToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        tokenType: 'Bearer',
        expiresIn: 900,
        mfaRequired: false,
      });
      const rotated = refreshTokenFrom(res);
      expect(rotated).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(rotated).not.toBe(refreshToken);

      // The new access token works and belongs to the SAME session.
      const me = await http().get('/api/v1/auth/me').set(bearer(res.body.accessToken));
      expect(me.status).toBe(200);
      expect(me.body.id).toBe(user.id);
      const claims = (token: string) =>
        JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
          sid: string;
          sub: string;
          exp: number;
          iat: number;
          [k: string]: unknown;
        };
      expect(claims(res.body.accessToken).sid).toBe(claims(accessToken).sid);
      expect(Object.keys(claims(res.body.accessToken)).sort()).toEqual([
        'exp',
        'iat',
        'sid',
        'sub',
      ]);
      expect(claims(res.body.accessToken).exp - claims(res.body.accessToken).iat).toBe(900);

      // Exactly one unused token per session after rotation.
      const sessionId = claims(accessToken).sid;
      const tokens = await prisma.refreshToken.findMany({ where: { sessionId } });
      expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
      expect(tokens.find((t) => t.usedAt === null)?.tokenHash).toBe(sha256(rotated ?? ''));
    });

    it('chains: each new token can be exchanged once more', async () => {
      const { refreshToken } = await newSession();
      let current = refreshToken;
      for (let i = 0; i < 3; i++) {
        const res = await refresh(app, current);
        expect(res.status).toBe(200);
        current = requireRefreshToken(res);
      }
    });

    it('never puts the refresh token, its hash or any credential in the response body', async () => {
      const { refreshToken } = await newSession();
      const res = await refresh(app, refreshToken);
      const dump = JSON.stringify(res.body) + JSON.stringify(res.text);
      expect(dump).not.toContain(refreshToken);
      expect(dump).not.toContain(sha256(refreshToken));
      expect(dump).not.toContain(requireRefreshToken(res));
      expect(dump).not.toMatch(/refresh|passwordHash|argon2/i);
    });

    it('keeps the session lifetime absolute: rotation never extends the session', async () => {
      const { user, refreshToken } = await newSession();
      const before = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      await refresh(app, refreshToken).expect(200);
      const after = await prisma.session.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.expiresAt).toEqual(before.expiresAt);
      const latest = await prisma.refreshToken.findFirstOrThrow({
        where: { sessionId: before.id, usedAt: null },
      });
      expect(latest.expiresAt.getTime()).toBeLessThanOrEqual(before.expiresAt.getTime());
    });

    it('caps a token at the session expiry when the session ends sooner', async () => {
      const { user, refreshToken } = await newSession();
      const soon = new Date(Date.now() + 60_000);
      await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: soon } });
      const res = await refresh(app, refreshToken);
      expect(res.status).toBe(200);
      const latest = await prisma.refreshToken.findFirstOrThrow({
        where: { session: { userId: user.id }, usedAt: null },
      });
      expect(latest.expiresAt.getTime()).toBeLessThanOrEqual(soon.getTime());
    });

    describe('rejections all look the same and clear the cookie', () => {
      const expectRejected = (res: request.Response) => {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({
          code: 'REFRESH_TOKEN_INVALID',
          message: 'Your session has ended. Sign in again.',
        });
        const cookies = setCookies(res);
        expect(cookies[0]).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));
        expect(cookies?.[0]).toMatch(/Path=\/api\/v1\/auth/);
        expect(cookies?.[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
      };

      it('missing cookie', async () => {
        const res = await refresh(app, null);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('REFRESH_TOKEN_INVALID');
      });

      it('malformed cookie', async () => {
        expect(await refresh(app, 'not-a-token').then((r) => r.status)).toBe(401);
      });

      it('unknown token', async () => {
        expectRejected(await refresh(app, 'A'.repeat(43)));
      });

      it('expired token', async () => {
        const { user, refreshToken } = await newSession();
        const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
        // The CHECK needs expires_at > created_at, so move both into the past.
        await prisma.$executeRaw`UPDATE refresh_tokens SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE session_id = ${session.id}::uuid`;
        expectRejected(await refresh(app, refreshToken));
        // An expired token is not replay: the session is left alone.
        const after = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
        expect(after.revokedAt).toBeNull();
      });

      it('revoked session', async () => {
        const { user, refreshToken } = await newSession();
        await prisma.session.updateMany({
          where: { userId: user.id },
          data: { revokedAt: new Date(), revokedReason: 'test' },
        });
        expectRejected(await refresh(app, refreshToken));
      });

      it('expired session', async () => {
        const { user, refreshToken } = await newSession();
        await prisma.$executeRaw`UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE user_id = ${user.id}::uuid`;
        expectRejected(await refresh(app, refreshToken));
      });

      it('disabled user, even with a perfectly valid token', async () => {
        const { user, refreshToken } = await newSession();
        await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.Disabled } });
        expectRejected(await refresh(app, refreshToken));
      });

      it('a revoked session also stops its already-issued access token', async () => {
        const { user, accessToken, refreshToken } = await newSession();
        await prisma.session.updateMany({
          where: { userId: user.id },
          data: { revokedAt: new Date(), revokedReason: 'test' },
        });
        expect((await refresh(app, refreshToken)).status).toBe(401);
        expect((await http().get('/api/v1/auth/me').set(bearer(accessToken))).status).toBe(401);
      });
    });

    it('role changes made after login apply to the refreshed access token', async () => {
      const { user, refreshToken } = await newSession([SystemRoleKey.Finance]);
      const bd = await prisma.role.findUniqueOrThrow({
        where: { key: SystemRoleKey.BusinessDevelopment },
      });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: bd.id } });
      const res = await refresh(app, refreshToken);
      const me = await http().get('/api/v1/auth/me').set(bearer(res.body.accessToken));
      expect(me.body.roles).toEqual([SystemRoleKey.BusinessDevelopment]);
    });

    it('audits a successful refresh without token material', async () => {
      const { user, refreshToken } = await newSession();
      const res = await refresh(app, refreshToken);
      const rows = await prisma.auditLog.findMany({
        where: { action: 'auth.refresh_succeeded', actorUserId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.category).toBe('SECURITY');
      const dump = JSON.stringify(rows);
      for (const secret of [refreshToken, requireRefreshToken(res), res.body.accessToken]) {
        expect(dump).not.toContain(secret);
      }
    });
  });

  describe('Step 5 guarantees still hold with refresh tokens in play', () => {
    it('a disabled user’s refresh token and access token both stop working', async () => {
      const { user, accessToken, refreshToken } = await newSession();
      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.Disabled } });
      expect((await refresh(app, refreshToken)).status).toBe(401);
      expect((await http().get('/api/v1/auth/me').set(bearer(accessToken))).status).toBe(401);
    });
  });
});
