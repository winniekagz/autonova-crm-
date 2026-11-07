import { SystemRoleKey, UserStatus } from '@autonova/enums';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PASSWORD,
  bearer,
  createApp,
  createUser,
  login,
  loginToken,
  uniqueEmail,
} from './helpers.js';

describe('authentication: login, /auth/me, logout, per-request checks (e2e)', () => {
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

  describe('login', () => {
    it('returns a bearer token and never a hash, a refresh token or a cookie', async () => {
      const user = await createUser(app);
      const res = await login(app, user.email);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        tokenType: 'Bearer',
        expiresIn: 900,
        mfaRequired: false,
      });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/i);
    });

    it('creates a session with ip and user agent, and records last login', async () => {
      const user = await createUser(app);
      const res = await http()
        .post('/api/v1/auth/login')
        .set('user-agent', 'e2e-agent/1.0')
        .send({ email: user.email, password: PASSWORD });
      expect(res.status).toBe(200);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.userAgent).toBe('e2e-agent/1.0');
      expect(session.ip).toBeTruthy();
      expect(session.revokedAt).toBeNull();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt,
      ).not.toBeNull();
    });

    it('normalises the email (case and whitespace)', async () => {
      const user = await createUser(app);
      const res = await login(app, `  ${user.email.toUpperCase()} `);
      expect(res.status).toBe(200);
    });

    describe('failure parity: the client cannot tell why login failed', () => {
      const failureBody = (res: request.Response) => ({
        status: res.status,
        code: res.body.code,
        message: res.body.message,
      });

      it('wrong password, unknown email, invited and disabled users all look identical', async () => {
        const active = await createUser(app);
        const invited = await createUser(app, { status: UserStatus.Invited, password: null });
        const disabled = await createUser(app, { status: UserStatus.Disabled });

        const results = await Promise.all([
          login(app, active.email, 'definitely the wrong password'),
          login(app, uniqueEmail('ghost'), PASSWORD),
          login(app, invited.email, PASSWORD),
          login(app, disabled.email, PASSWORD),
        ]);

        const expected = {
          status: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        };
        for (const res of results) expect(failureBody(res)).toEqual(expected);
      });

      it('a disabled user cannot log in even with the right password, and gets no session', async () => {
        const disabled = await createUser(app, { status: UserStatus.Disabled });
        expect((await login(app, disabled.email)).status).toBe(401);
        expect(await prisma.session.count({ where: { userId: disabled.id } })).toBe(0);
      });
    });

    it('rejects malformed bodies with field-level validation errors and unknown keys', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'email',
        'password',
      ]);

      const extra = await http()
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('x'), password: 'p', isAdmin: true });
      expect(extra.status).toBe(400);
    });

    it('audits failures (SECURITY) and successes without recording secrets or the typed email', async () => {
      const user = await createUser(app);
      await login(app, user.email, 'wrong password entirely');
      await login(app, user.email);

      const rows = await prisma.auditLog.findMany({
        where: { category: 'SECURITY', OR: [{ entityId: user.id }, { actorUserId: user.id }] },
      });
      expect(rows.map((r) => r.action).sort()).toEqual([
        'auth.login_failed',
        'auth.login_succeeded',
      ]);
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(PASSWORD);
      expect(dump).not.toContain('wrong password entirely');
      expect(dump).not.toContain(user.email);
      expect(dump).not.toMatch(/argon2/);
    });

    it('upgrades a password hash made with weaker parameters on successful login', async () => {
      const user = await createUser(app);
      const { hash } = await import('@node-rs/argon2');
      const weak = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: weak } });

      expect((await login(app, user.email)).status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).not.toBe(weak);
      expect(after.passwordHash).toMatch(/\$m=65536,t=3,p=1\$/);
      expect((await login(app, user.email)).status).toBe(200);
    });
  });

  describe('protected routes (deny by default)', () => {
    it('rejects requests with no token', async () => {
      const res = await http().get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it.each([
      ['wrong scheme', 'Basic abc'],
      ['empty bearer', 'Bearer '],
      ['not a jwt', 'Bearer not-a-jwt'],
      ['two segments', 'Bearer aaa.bbb'],
    ])('rejects a malformed Authorization header: %s', async (_name, value) => {
      const res = await http().get('/api/v1/auth/me').set('authorization', value);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('a private route rejects anonymous callers with 401, never its data', async () => {
      const res = await http().get('/api/v1/test-probe');
      expect(res.status).toBe(401);
      expect(res.body).not.toHaveProperty('ok');
    });

    it('a path that matches no route is a plain 404 (Nest answers before any guard runs)', async () => {
      // Documented behaviour: this reveals only that a path does not exist. Every route that DOES
      // exist is private unless explicitly @Public (see the allow-list test below).
      const res = await http().get('/api/v1/definitely-not-a-route');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('keeps health endpoints public', async () => {
      await http().get('/api/v1/health/live').expect(200);
      await http().get('/api/v1/health').expect(200);
    });

    it('every route is private except an explicit allow-list (guards against accidental @Public)', async () => {
      const doc = await http().get('/api/docs-json').expect(200);
      const publicOps = new Set<string>();
      for (const [path, methods] of Object.entries<Record<string, unknown>>(doc.body.paths)) {
        for (const method of Object.keys(methods)) {
          const res = await http()[method as 'get' | 'post'](path.replace(/\{[^}]+\}/g, 'x'));
          if (res.status !== 401) publicOps.add(`${method.toUpperCase()} ${path} -> ${res.status}`);
        }
      }
      // login is public (and answers 400 to an empty body); health endpoints answer 200.
      // The test-only probe is private (401) and therefore absent from this list.
      expect([...publicOps].sort()).toEqual([
        'GET /api/v1/health -> 200',
        'GET /api/v1/health/live -> 200',
        'POST /api/v1/auth/login -> 400',
      ]);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user with roles from the database', async () => {
      const user = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const token = await loginToken(app, user.email);
      const res = await http().get('/api/v1/auth/me').set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: user.id,
        email: user.email,
        fullName: 'Test User',
        roles: ['finance'],
        permissions: [],
        mfa: { required: false, verified: false },
        restricted: false,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/i);
    });
  });

  describe('per-request user and session validation', () => {
    it('a disabled user’s still-valid token stops working on the very next request', async () => {
      const user = await createUser(app);
      const token = await loginToken(app, user.email);
      await http().get('/api/v1/auth/me').set(bearer(token)).expect(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.Disabled } });

      const res = await http().get('/api/v1/auth/me').set(bearer(token));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('a revoked session’s still-valid token stops working on the very next request', async () => {
      const user = await createUser(app);
      const token = await loginToken(app, user.email);
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date(), revokedReason: 'admin' },
      });
      await http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
    });

    it('an expired session is rejected even though the JWT has not expired', async () => {
      const user = await createUser(app);
      const token = await loginToken(app, user.email);
      // Owner-only operation is unnecessary: expires_at may be moved into the past if it stays
      // after created_at (CHECK), so move creation back first.
      await prisma.$executeRaw`UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 hour' WHERE user_id = ${user.id}::uuid`;
      await http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
    });

    it('role changes apply on the next request: a token minted as Finance becomes Business Development', async () => {
      const user = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const token = await loginToken(app, user.email);
      expect((await http().get('/api/v1/auth/me').set(bearer(token))).body.roles).toEqual([
        'finance',
      ]);

      const bd = await prisma.role.findUniqueOrThrow({
        where: { key: SystemRoleKey.BusinessDevelopment },
      });
      const finance = await prisma.role.findUniqueOrThrow({
        where: { key: SystemRoleKey.Finance },
      });
      await prisma.userRole.delete({
        where: { userId_roleId: { userId: user.id, roleId: finance.id } },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: bd.id } });

      const after = await http().get('/api/v1/auth/me').set(bearer(token));
      expect(after.status).toBe(200);
      expect(after.body.roles).toEqual(['business_development']);
    });

    it('a roles claim smuggled into a correctly signed token is ignored', async () => {
      const user = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const token = await loginToken(app, user.email);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      // Sign with the real secret (as an attacker who stole the key could): roles still come from the DB,
      // and extra claims make the token invalid for this API.
      const forged = await new JwtService({}).signAsync(
        { sub: user.id, sid: session.id, roles: ['director'] },
        { secret: process.env.JWT_ACCESS_SECRET, algorithm: 'HS256', expiresIn: 60 },
      );
      const res = await http().get('/api/v1/auth/me').set(bearer(forged));
      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual(['finance']);
      void token;
    });

    it('a token for another user’s session id is rejected (subject mismatch)', async () => {
      const victim = await createUser(app);
      const attacker = await createUser(app);
      await loginToken(app, victim.email);
      const victimSession = await prisma.session.findFirstOrThrow({ where: { userId: victim.id } });
      const forged = await new JwtService({}).signAsync(
        { sub: attacker.id, sid: victimSession.id },
        { secret: process.env.JWT_ACCESS_SECRET, algorithm: 'HS256', expiresIn: 60 },
      );
      await http().get('/api/v1/auth/me').set(bearer(forged)).expect(401);
    });

    it('rejects a token signed with the wrong secret and distinguishes an expired token', async () => {
      const user = await createUser(app);
      await loginToken(app, user.email);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      const wrong = await new JwtService({}).signAsync(
        { sub: user.id, sid: session.id },
        { secret: 'z'.repeat(48), algorithm: 'HS256', expiresIn: 60 },
      );
      const bad = await http().get('/api/v1/auth/me').set(bearer(wrong));
      expect(bad.status).toBe(401);
      expect(bad.body.code).toBe('UNAUTHENTICATED');

      const expired = await new JwtService({}).signAsync(
        { sub: user.id, sid: session.id, iat: Math.floor(Date.now() / 1000) - 3600 },
        { secret: process.env.JWT_ACCESS_SECRET, algorithm: 'HS256', expiresIn: 60 },
      );
      const res = await http().get('/api/v1/auth/me').set(bearer(expired));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('Director sessions are restricted until MFA is verified', () => {
    it('login reports mfaRequired; /auth/me works; every other route is 403 MFA_REQUIRED', async () => {
      const director = await createUser(app, { roles: [SystemRoleKey.Director] });
      const res = await login(app, director.email);
      expect(res.body.mfaRequired).toBe(true);
      const token = res.body.accessToken as string;

      const me = await http().get('/api/v1/auth/me').set(bearer(token));
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({
        restricted: true,
        mfa: { required: true, verified: false },
        roles: ['director'],
      });

      // The probe is a private route that does NOT allow restricted sessions.
      const blocked = await http().get('/api/v1/test-probe').set(bearer(token));
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('MFA_REQUIRED');
    });

    it('a restricted Director session may still log out', async () => {
      const director = await createUser(app, { roles: [SystemRoleKey.Director] });
      const token = await loginToken(app, director.email);
      await http().post('/api/v1/auth/logout').set(bearer(token)).expect(204);
      await http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
    });

    it('verified MFA lifts the restriction', async () => {
      const director = await createUser(app, { roles: [SystemRoleKey.Director] });
      const token = await loginToken(app, director.email);
      await prisma.session.updateMany({
        where: { userId: director.id },
        data: { mfaVerifiedAt: new Date() },
      });
      const me = await http().get('/api/v1/auth/me').set(bearer(token));
      expect(me.body).toMatchObject({ restricted: false, mfa: { required: true, verified: true } });
      // the probe route is now reachable instead of blocked (403)
      await http().get('/api/v1/test-probe').set(bearer(token)).expect(200);
    });
  });

  describe('logout', () => {
    it('revokes the session: the same token is rejected afterwards, and other sessions survive', async () => {
      const user = await createUser(app);
      const first = await loginToken(app, user.email);
      const second = await loginToken(app, user.email);

      await http().post('/api/v1/auth/logout').set(bearer(first)).expect(204);

      await http().get('/api/v1/auth/me').set(bearer(first)).expect(401);
      await http().get('/api/v1/auth/me').set(bearer(second)).expect(200);

      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions.filter((s) => s.revokedAt)).toHaveLength(1);
      expect(sessions.find((s) => s.revokedAt)?.revokedReason).toBe('logout');
    });

    it('requires authentication and is audited once', async () => {
      await http().post('/api/v1/auth/logout').expect(401);
      const user = await createUser(app);
      const token = await loginToken(app, user.email);
      await http().post('/api/v1/auth/logout').set(bearer(token)).expect(204);
      await http().post('/api/v1/auth/logout').set(bearer(token)).expect(401);
      const rows = await prisma.auditLog.findMany({
        where: { action: 'auth.logout', actorUserId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.category).toBe('SECURITY');
    });
  });
});
