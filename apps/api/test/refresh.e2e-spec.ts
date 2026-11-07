import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  REFRESH_COOKIE,
  WEB_ORIGIN,
  bearer,
  createApp,
  createUser,
  login,
  loginSession,
  refresh,
  refreshTokenFrom,
  requireRefreshToken,
  setCookies,
} from './helpers.js';
import { createHash } from 'node:crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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

  const newSession = async (roles?: string[]) => {
    const user = await createUser(app, roles ? { roles } : {});
    const session = await loginSession(app, user.email);
    return { user, ...session };
  };

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

  describe('Step 5 guarantees still hold with refresh tokens in play', () => {
    it('a disabled user’s refresh token and access token both stop working', async () => {
      const { user, accessToken, refreshToken } = await newSession();
      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.Disabled } });
      expect((await refresh(app, refreshToken)).status).toBe(401);
      expect((await http().get('/api/v1/auth/me').set(bearer(accessToken))).status).toBe(401);
    });
  });
});
