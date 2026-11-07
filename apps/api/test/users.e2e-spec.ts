import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PASSWORD,
  bearer,
  createApp,
  createUser,
  createVerifiedDirector,
  login,
  loginToken,
  loginVerifiedToken,
  uniqueEmail,
} from './helpers.js';

const SENSITIVE = /passwordHash|password_hash|argon2|refreshToken|mfaSecret|recovery|token|secret/i;

describe('user administration (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  // The last-Director rules count ALL active Directors in the database, and earlier tests (and
  // other suites) leave some behind. Disable every Director this test does not own so each test
  // controls exactly who is an active Director.
  let owned: string[] = [];
  async function isolateDirectors() {
    await prisma.user.updateMany({
      where: {
        id: { notIn: owned },
        roles: { some: { role: { key: SystemRoleKey.Director } } },
        status: UserStatus.Active,
      },
      data: { status: UserStatus.Disabled },
    });
  }
  async function directorActor() {
    const { director, token } = await createVerifiedDirector(app);
    owned.push(director.id);
    await isolateDirectors();
    return { director, token };
  }
  beforeEach(() => {
    owned = [];
  });

  const invite = (token: string, body: object) =>
    http().post('/api/v1/users').set(bearer(token)).send(body);

  describe('permissions: who may do what', () => {
    it('anonymous callers are refused on every users/roles route', async () => {
      const id = '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60';
      for (const [method, path] of [
        ['get', '/api/v1/users'],
        ['post', '/api/v1/users'],
        ['get', `/api/v1/users/${id}`],
        ['patch', `/api/v1/users/${id}`],
        ['put', `/api/v1/users/${id}/roles`],
        ['post', `/api/v1/users/${id}/disable`],
        ['get', '/api/v1/roles'],
      ] as const) {
        expect((await http()[method](path)).status, `${method} ${path}`).toBe(401);
      }
    });

    it.each([
      SystemRoleKey.BusinessDevelopment,
      SystemRoleKey.TechnicalLead,
      SystemRoleKey.Finance,
    ])(
      '%s is refused (403 FORBIDDEN) on every users/roles route and nothing is created',
      async (role) => {
        const { director } = await directorActor();
        const user = await createUser(app, { roles: [role] });
        const token = await loginToken(app, user.email);
        const before = await prisma.user.count();
        const id = director.id;

        const attempts = await Promise.all([
          http().get('/api/v1/users').set(bearer(token)),
          http().get(`/api/v1/users/${id}`).set(bearer(token)),
          http().get('/api/v1/roles').set(bearer(token)),
          invite(token, { email: uniqueEmail('x'), fullName: 'X', roles: ['finance'] }),
          http().patch(`/api/v1/users/${id}`).set(bearer(token)).send({ fullName: 'Hacked' }),
          http()
            .put(`/api/v1/users/${id}/roles`)
            .set(bearer(token))
            .send({ roles: ['finance'] }),
          http().post(`/api/v1/users/${id}/disable`).set(bearer(token)).send({}),
        ]);
        for (const res of attempts) {
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('FORBIDDEN');
        }
        expect(await prisma.user.count()).toBe(before);
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).fullName).toBe('Test User');
      },
    );

    it('a Director whose session has NOT completed MFA cannot use user management', async () => {
      const director = await createUser(app, { roles: [SystemRoleKey.Director] });
      const token = await loginToken(app, director.email); // not MFA-verified
      for (const res of [
        await http().get('/api/v1/users').set(bearer(token)),
        await invite(token, { email: uniqueEmail('x'), fullName: 'X', roles: ['finance'] }),
        await http().get('/api/v1/roles').set(bearer(token)),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('MFA_REQUIRED');
      }
    });

    it('permissions are read from the database on each request, not the token', async () => {
      const { token } = await directorActor();
      await http().get('/api/v1/users').set(bearer(token)).expect(200);

      const director = await prisma.user.findFirstOrThrow({ where: { id: { in: owned } } });
      const finance = await prisma.role.findUniqueOrThrow({
        where: { key: SystemRoleKey.Finance },
      });
      const dirRole = await prisma.role.findUniqueOrThrow({
        where: { key: SystemRoleKey.Director },
      });
      await prisma.userRole.delete({
        where: { userId_roleId: { userId: director.id, roleId: dirRole.id } },
      });
      await prisma.userRole.create({ data: { userId: director.id, roleId: finance.id } });

      const res = await http().get('/api/v1/users').set(bearer(token));
      expect(res.status).toBe(403);
    });

    it('a private route that declares no authorization is refused (fails closed)', async () => {
      const app2 = await createApp({ withProbe: true });
      try {
        const user = await createUser(app2, { roles: [SystemRoleKey.Director] });
        const token = await loginVerifiedToken(app2, user.email);
        const res = await request(app2.getHttpServer())
          .get('/api/v1/test-probe/unmarked')
          .set(bearer(token));
        expect(res.status).toBe(403);
      } finally {
        await app2.close();
      }
    });
  });

  describe('create (invite)', () => {
    it('creates an INVITED user with no password, the requested roles, and a safe response', async () => {
      const { director, token } = await directorActor();
      const email = uniqueEmail('new');
      const res = await invite(token, {
        email,
        fullName: '  Wanjiru Kamau ',
        roles: ['finance', 'technical_lead'],
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        email,
        fullName: 'Wanjiru Kamau',
        status: 'INVITED',
        roles: ['finance', 'technical_lead'],
        lastLoginAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.passwordHash).toBeNull();
      expect(row.status).toBe(UserStatus.Invited);

      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: res.body.id } });
      expect(audit).toMatchObject({
        action: 'user.created',
        category: 'BUSINESS',
        actorUserId: director.id,
        entityType: 'user',
      });
      expect(audit.newValues).toEqual({
        email,
        fullName: 'Wanjiru Kamau',
        status: 'INVITED',
        roles: 'finance,technical_lead',
      });
      expect(JSON.stringify(audit)).not.toMatch(SENSITIVE);
    });

    it('normalises the email (case/whitespace) and treats variants as duplicates', async () => {
      const { token } = await directorActor();
      const email = uniqueEmail('dup');
      const first = await invite(token, {
        email: `  ${email.toUpperCase()} `,
        fullName: 'A',
        roles: ['finance'],
      });
      expect(first.status).toBe(201);
      expect(first.body.email).toBe(email);

      const second = await invite(token, { email, fullName: 'B', roles: ['finance'] });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it('rejects duplicates created concurrently: the database index decides, exactly one wins', async () => {
      const { token } = await directorActor();
      const email = uniqueEmail('race');
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          invite(token, { email, fullName: 'R', roles: ['finance'] }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it('does not let the caller choose status, password, permissions or id (mass assignment)', async () => {
      const { token } = await directorActor();
      for (const extra of [
        { status: 'ACTIVE' },
        { passwordHash: 'x' },
        { password: 'a sufficiently long passphrase' },
        { permissions: ['users:create'] },
        { id: '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60' },
        { isAdmin: true },
      ]) {
        const email = uniqueEmail('mass');
        const res = await invite(token, { email, fullName: 'M', roles: ['finance'], ...extra });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(await prisma.user.count({ where: { email } })).toBe(0);
      }
    });

    it('rejects invalid input with field-level errors, including unknown and duplicate-style roles', async () => {
      const { token } = await directorActor();
      const bad = await invite(token, { email: 'nope', fullName: '   ', roles: [] });
      expect(bad.status).toBe(400);
      expect(bad.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'email',
        'fullName',
        'roles',
      ]);

      for (const roles of [['superadmin'], ['director', 'root'], ['*'], ['users:create'], [123]]) {
        const res = await invite(token, { email: uniqueEmail('r'), fullName: 'R', roles });
        expect(res.status, JSON.stringify(roles)).toBe(400);
      }
    });

    it('collapses a repeated role and stores it once', async () => {
      const { token } = await directorActor();
      const res = await invite(token, {
        email: uniqueEmail('rep'),
        fullName: 'R',
        roles: ['finance', 'finance'],
      });
      expect(res.status).toBe(201);
      expect(res.body.roles).toEqual(['finance']);
    });

    it('a created (INVITED) user cannot sign in', async () => {
      const { token } = await directorActor();
      const email = uniqueEmail('inv');
      await invite(token, { email, fullName: 'I', roles: ['finance'] }).expect(201);
      expect((await login(app, email, PASSWORD)).status).toBe(401);
    });

    it('writes its audit row through the transaction client (so it commits and rolls back with the change)', async () => {
      const { token } = await directorActor();
      const audit = app.get(AuditService);
      const spy = vi.spyOn(audit, 'record');
      try {
        await invite(token, { email: uniqueEmail('tx'), fullName: 'T', roles: ['finance'] }).expect(
          201,
        );
        const client = spy.mock.calls[0]?.[0];
        expect(client).toBeDefined();
        // Passing the root PrismaService here would let the audit row commit on its own.
        expect(client).not.toBe(prisma);
      } finally {
        spy.mockRestore();
      }
    });

    it('rolls back the user when the audit write fails (atomic)', async () => {
      const { token } = await directorActor();
      const email = uniqueEmail('atomic');
      const spy = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValueOnce(new Error('audit down'));
      try {
        const res = await invite(token, { email, fullName: 'A', roles: ['finance'] });
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
      } finally {
        spy.mockRestore();
      }
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { action: 'user.created', newValues: { path: ['email'], equals: email } },
        }),
      ).toBe(0);
    });
  });

  describe('list and details', () => {
    it('paginates in the database and reports the total', async () => {
      const { token } = await directorActor();
      const tag = `page${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await createUser(app, {
          email: `${tag}-${i}@autonova.test`,
          roles: [SystemRoleKey.Finance],
        });
      }
      const first = await http()
        .get('/api/v1/users')
        .query({ q: tag, page: 1, pageSize: 2 })
        .set(bearer(token));
      const third = await http()
        .get('/api/v1/users')
        .query({ q: tag, page: 3, pageSize: 2 })
        .set(bearer(token));
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 5 });
      expect(first.body.items).toHaveLength(2);
      expect(third.body.items).toHaveLength(1);

      const ids = new Set<string>();
      for (const p of [1, 2, 3]) {
        const res = await http()
          .get('/api/v1/users')
          .query({ q: tag, page: p, pageSize: 2 })
          .set(bearer(token));
        for (const item of res.body.items) ids.add(item.id);
      }
      expect(ids.size).toBe(5); // stable ordering: no duplicates, no gaps
    });

    it('caps page size and rejects nonsense paging', async () => {
      const { token } = await directorActor();
      for (const query of [
        { pageSize: 101 },
        { page: 0 },
        { pageSize: 'abc' },
        { status: 'WHATEVER' },
        { role: 'root' },
      ]) {
        const res = await http().get('/api/v1/users').query(query).set(bearer(token));
        expect(res.status, JSON.stringify(query)).toBe(400);
      }
    });

    it('filters by status, role and search text (case-insensitive, name or email)', async () => {
      const { token } = await directorActor();
      const tag = `filt${Date.now()}`;
      const fin = await createUser(app, {
        email: `${tag}-fin@autonova.test`,
        roles: [SystemRoleKey.Finance],
      });
      await createUser(app, {
        email: `${tag}-bd@autonova.test`,
        roles: [SystemRoleKey.BusinessDevelopment],
      });
      await createUser(app, {
        email: `${tag}-off@autonova.test`,
        roles: [SystemRoleKey.Finance],
        status: UserStatus.Disabled,
      });

      const byRole = await http()
        .get('/api/v1/users')
        .query({ q: tag.toUpperCase(), role: 'finance' })
        .set(bearer(token));
      expect(byRole.body.items.map((u: { id: string }) => u.id)).toContain(fin.id);
      expect(byRole.body.items.every((u: { roles: string[] }) => u.roles.includes('finance'))).toBe(
        true,
      );
      expect(byRole.body.total).toBe(2);

      const disabled = await http()
        .get('/api/v1/users')
        .query({ q: tag, status: 'DISABLED' })
        .set(bearer(token));
      expect(disabled.body.total).toBe(1);
      expect(disabled.body.items[0].email).toBe(`${tag}-off@autonova.test`);
    });

    it('treats search text literally (wildcards and injection are just characters)', async () => {
      const { token } = await directorActor();
      for (const q of ['%', '_', "'; DROP TABLE users; --", '\\']) {
        const res = await http().get('/api/v1/users').query({ q }).set(bearer(token));
        expect(res.status).toBe(200);
      }
      expect(await prisma.user.count()).toBeGreaterThan(0);
    });

    it('returns safe DTOs only: no credential or internal fields anywhere', async () => {
      const { token } = await directorActor();
      const list = await http().get('/api/v1/users').set(bearer(token));
      expect(JSON.stringify(list.body)).not.toMatch(SENSITIVE);
      for (const item of list.body.items) {
        expect(Object.keys(item).sort()).toEqual([
          'createdAt',
          'email',
          'fullName',
          'id',
          'lastLoginAt',
          'roles',
          'status',
          'updatedAt',
        ]);
      }
      const one = await http().get(`/api/v1/users/${list.body.items[0].id}`).set(bearer(token));
      expect(one.status).toBe(200);
      expect(JSON.stringify(one.body)).not.toMatch(SENSITIVE);
    });

    it('detail: 404 for an unknown id, 400 for a malformed id', async () => {
      const { token } = await directorActor();
      const missing = await http()
        .get('/api/v1/users/0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60')
        .set(bearer(token));
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('USER_NOT_FOUND');
      expect((await http().get('/api/v1/users/not-a-uuid').set(bearer(token))).status).toBe(400);
    });

    it('lists roles for the picker', async () => {
      const { token } = await directorActor();
      const res = await http().get('/api/v1/roles').set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.map((r: { key: string }) => r.key)).toEqual([
        'business_development',
        'director',
        'finance',
        'technical_lead',
      ]);
      expect(Object.keys(res.body[0]).sort()).toEqual(['description', 'key', 'name']);
    });
  });

  describe('update (display name)', () => {
    it('updates the name, audits old and new, and is a no-op without audit noise when unchanged', async () => {
      const { director, token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });

      const res = await http()
        .patch(`/api/v1/users/${target.id}`)
        .set(bearer(token))
        .send({ fullName: ' New Name ' });
      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe('New Name');

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: target.id, action: 'user.updated' },
      });
      expect(audit).toMatchObject({
        actorUserId: director.id,
        oldValues: { fullName: 'Test User' },
        newValues: { fullName: 'New Name' },
      });

      await http()
        .patch(`/api/v1/users/${target.id}`)
        .set(bearer(token))
        .send({ fullName: 'New Name' })
        .expect(200);
      expect(
        await prisma.auditLog.count({ where: { entityId: target.id, action: 'user.updated' } }),
      ).toBe(1);
    });

    it('refuses email, status, roles and password fields (only fullName is editable here)', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      for (const body of [
        { email: 'x@y.co' },
        { status: 'DISABLED' },
        { roles: ['director'] },
        { fullName: 'A', passwordHash: 'x' },
        {},
      ]) {
        const res = await http().patch(`/api/v1/users/${target.id}`).set(bearer(token)).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after).toMatchObject({ fullName: 'Test User', status: 'ACTIVE' });
    });

    it('404 for an unknown user', async () => {
      const { token } = await directorActor();
      const res = await http()
        .patch('/api/v1/users/0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60')
        .set(bearer(token))
        .send({ fullName: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('role changes', () => {
    it('applies on the target’s very next request and audits before/after with the reason', async () => {
      const { director, token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);
      expect((await http().get('/api/v1/auth/me').set(bearer(targetToken))).body.roles).toEqual([
        'finance',
      ]);

      const res = await http()
        .put(`/api/v1/users/${target.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['business_development', 'technical_lead'], reason: 'Moved to sales' });
      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual(['business_development', 'technical_lead']);

      // Finance was removed => sessions revoked (docs/06): the old token stops working immediately.
      expect((await http().get('/api/v1/auth/me').set(bearer(targetToken))).status).toBe(401);
      const fresh = await loginToken(app, target.email);
      expect((await http().get('/api/v1/auth/me').set(bearer(fresh))).body.roles).toEqual([
        'business_development',
        'technical_lead',
      ]);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: target.id, action: 'user.roles_changed' },
      });
      expect(audit).toMatchObject({
        actorUserId: director.id,
        reason: 'Moved to sales',
        oldValues: { roles: 'finance' },
        newValues: { roles: 'business_development,technical_lead', sessionsRevoked: 1 },
      });
    });

    it('granting an additional role keeps existing sessions alive and takes effect next request', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);

      await http()
        .put(`/api/v1/users/${target.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['finance', 'technical_lead'] })
        .expect(200);

      const me = await http().get('/api/v1/auth/me').set(bearer(targetToken));
      expect(me.status).toBe(200);
      expect(me.body.roles).toEqual(['finance', 'technical_lead']);
    });

    it('promoting someone to Director revokes their old session; the new one is restricted until MFA', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);
      expect((await http().get('/api/v1/users').set(bearer(targetToken))).status).toBe(403);

      await http()
        .put(`/api/v1/users/${target.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['director'] })
        .expect(200);

      // Finance was removed, so the old session is revoked outright.
      expect((await http().get('/api/v1/users').set(bearer(targetToken))).status).toBe(401);
      // A new login yields a Director session that is restricted: promotion alone grants no access.
      const fresh = await loginToken(app, target.email);
      const res = await http().get('/api/v1/users').set(bearer(fresh));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MFA_REQUIRED');
    });

    it('policy: nobody may change their OWN roles, up or down', async () => {
      const { director, token } = await directorActor();
      const res = await http()
        .put(`/api/v1/users/${director.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['director', 'finance'] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SELF_ROLE_CHANGE_FORBIDDEN');
      expect((await http().get('/api/v1/auth/me').set(bearer(token))).body.roles).toEqual([
        'director',
      ]);
    });

    it('a non-Director cannot escalate themselves (no permission, and the self rule would stop them anyway)', async () => {
      const { token: dirToken } = await directorActor();
      void dirToken;
      const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
      const token = await loginToken(app, bd.email);
      const res = await http()
        .put(`/api/v1/users/${bd.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['director'] });
      expect(res.status).toBe(403);
      expect(await prisma.userRole.count({ where: { userId: bd.id } })).toBe(1);
    });

    it('LAST_DIRECTOR: two Directors cannot demote each other at the same time', async () => {
      // A single actor can never reach this rule (the actor is itself an active Director and may not
      // target themselves), so it only matters under concurrency. The director-set lock makes the
      // second request see the first one's result.
      const { director: a, token: ta } = await directorActor();
      const b = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(b.id);
      const tb = await loginVerifiedToken(app, b.email);

      const [ab, ba] = await Promise.all([
        http()
          .put(`/api/v1/users/${b.id}/roles`)
          .set(bearer(ta))
          .send({ roles: ['finance'] }),
        http()
          .put(`/api/v1/users/${a.id}/roles`)
          .set(bearer(tb))
          .send({ roles: ['finance'] }),
      ]);

      expect([ab.status, ba.status].sort((a, b) => a - b)).toEqual([200, 422]);
      expect((ab.status === 422 ? ab : ba).body.code).toBe('LAST_DIRECTOR');
      expect(
        await prisma.user.count({
          where: {
            id: { in: [a.id, b.id] },
            status: 'ACTIVE',
            roles: { some: { role: { key: 'director' } } },
          },
        }),
      ).toBe(1);
    });

    it('LAST_DIRECTOR holds even when both requests pass their check at the same moment', async () => {
      // Without the director-set lock both transactions read "one other active Director" and both
      // commit. Holding each transaction open just before its audit write forces that overlap.
      const { director: a, token: ta } = await directorActor();
      const b = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(b.id);
      const tb = await loginVerifiedToken(app, b.email);

      const audit = app.get(AuditService);
      const realRecord = audit.record.bind(audit);
      const spy = vi.spyOn(audit, 'record').mockImplementation(async (db, event) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await realRecord(db, event);
      });
      let results: request.Response[];
      try {
        results = await Promise.all([
          http()
            .put(`/api/v1/users/${b.id}/roles`)
            .set(bearer(ta))
            .send({ roles: ['finance'] }),
          http()
            .put(`/api/v1/users/${a.id}/roles`)
            .set(bearer(tb))
            .send({ roles: ['finance'] }),
        ]);
      } finally {
        spy.mockRestore();
      }
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 422]);
      expect(
        await prisma.user.count({
          where: {
            id: { in: [a.id, b.id] },
            status: 'ACTIVE',
            roles: { some: { role: { key: 'director' } } },
          },
        }),
      ).toBe(1);
    });

    it('rejects unknown roles, empty sets, extra fields and unknown users', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      for (const body of [
        { roles: [] },
        { roles: ['root'] },
        { roles: ['finance'], permissions: ['x:y'] },
        {},
        { roles: 'finance' },
      ]) {
        const res = await http()
          .put(`/api/v1/users/${target.id}/roles`)
          .set(bearer(token))
          .send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      const missing = await http()
        .put('/api/v1/users/0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60/roles')
        .set(bearer(token))
        .send({ roles: ['finance'] });
      expect(missing.status).toBe(404);
      expect(await prisma.userRole.count({ where: { userId: target.id } })).toBe(1);
    });

    it('an unchanged role set is a no-op: no audit row, sessions untouched', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);
      await http()
        .put(`/api/v1/users/${target.id}/roles`)
        .set(bearer(token))
        .send({ roles: ['finance'] })
        .expect(200);
      expect(
        await prisma.auditLog.count({
          where: { entityId: target.id, action: 'user.roles_changed' },
        }),
      ).toBe(0);
      await http().get('/api/v1/auth/me').set(bearer(targetToken)).expect(200);
    });

    it('rolls back the role change and the session revocation when the audit write fails', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);
      const spy = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValueOnce(new Error('audit down'));
      try {
        const res = await http()
          .put(`/api/v1/users/${target.id}/roles`)
          .set(bearer(token))
          .send({ roles: ['business_development'] });
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      const me = await http().get('/api/v1/auth/me').set(bearer(targetToken));
      expect(me.status).toBe(200); // session NOT revoked
      expect(me.body.roles).toEqual(['finance']); // role NOT changed
    });
  });

  describe('disable', () => {
    it('disables the user, revokes every session, blocks login, audits, and never deletes', async () => {
      const { director, token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const t1 = await loginToken(app, target.email);
      const t2 = await loginToken(app, target.email);

      const res = await http()
        .post(`/api/v1/users/${target.id}/disable`)
        .set(bearer(token))
        .send({ reason: 'Left the company' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DISABLED');
      expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);

      await http().get('/api/v1/auth/me').set(bearer(t1)).expect(401);
      await http().get('/api/v1/auth/me').set(bearer(t2)).expect(401);
      expect((await login(app, target.email)).status).toBe(401);

      expect(await prisma.user.count({ where: { id: target.id } })).toBe(1);
      const sessions = await prisma.session.findMany({ where: { userId: target.id } });
      expect(sessions.every((s) => s.revokedAt && s.revokedReason === 'user_disabled')).toBe(true);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: target.id, action: 'user.disabled' },
      });
      expect(audit).toMatchObject({
        actorUserId: director.id,
        reason: 'Left the company',
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'DISABLED', sessionsRevoked: 2 },
      });
    });

    it('can cancel an invitation (INVITED -> DISABLED) and refuses to disable twice', async () => {
      const { token } = await directorActor();
      const email = uniqueEmail('cancel');
      const created = await invite(token, { email, fullName: 'C', roles: ['finance'] });
      await http()
        .post(`/api/v1/users/${created.body.id}/disable`)
        .set(bearer(token))
        .send({})
        .expect(200);
      const again = await http()
        .post(`/api/v1/users/${created.body.id}/disable`)
        .set(bearer(token))
        .send({});
      expect(again.status).toBe(422);
      expect(again.body.code).toBe('USER_ALREADY_DISABLED');
    });

    it('refuses to disable yourself', async () => {
      const { director, token } = await directorActor();
      const res = await http()
        .post(`/api/v1/users/${director.id}/disable`)
        .set(bearer(token))
        .send({});
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SELF_DISABLE_FORBIDDEN');
      await http().get('/api/v1/auth/me').set(bearer(token)).expect(200);
    });

    it('LAST_DIRECTOR: two Directors cannot disable each other at the same time', async () => {
      const { director: a, token: ta } = await directorActor();
      const b = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(b.id);
      const tb = await loginVerifiedToken(app, b.email);

      const [ab, ba] = await Promise.all([
        http().post(`/api/v1/users/${b.id}/disable`).set(bearer(ta)).send({}),
        http().post(`/api/v1/users/${a.id}/disable`).set(bearer(tb)).send({}),
      ]);
      expect([ab.status, ba.status].sort((a, b) => a - b)).toEqual([200, 422]);
      expect((ab.status === 422 ? ab : ba).body.code).toBe('LAST_DIRECTOR');
      expect(
        await prisma.user.count({ where: { id: { in: [a.id, b.id] }, status: 'ACTIVE' } }),
      ).toBe(1);
    });

    it('LAST_DIRECTOR holds even when both disable requests pass their check at the same moment', async () => {
      const { director: a, token: ta } = await directorActor();
      const b = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(b.id);
      const tb = await loginVerifiedToken(app, b.email);

      const audit = app.get(AuditService);
      const realRecord = audit.record.bind(audit);
      const spy = vi.spyOn(audit, 'record').mockImplementation(async (db, event) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await realRecord(db, event);
      });
      let results: request.Response[];
      try {
        results = await Promise.all([
          http().post(`/api/v1/users/${b.id}/disable`).set(bearer(ta)).send({}),
          http().post(`/api/v1/users/${a.id}/disable`).set(bearer(tb)).send({}),
        ]);
      } finally {
        spy.mockRestore();
      }
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 422]);
      expect(
        await prisma.user.count({ where: { id: { in: [a.id, b.id] }, status: 'ACTIVE' } }),
      ).toBe(1);
    });

    it('a disabled Director is no longer counted as an active Director', async () => {
      const { director: a, token: ta } = await directorActor();
      const b = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(b.id);
      await http().post(`/api/v1/users/${b.id}/disable`).set(bearer(ta)).send({}).expect(200);

      // b is disabled: a is the last active Director, so a third party disabling a would be refused.
      const c = await createUser(app, { roles: [SystemRoleKey.Director] });
      owned.push(c.id);
      const tc = await loginVerifiedToken(app, c.email);
      const res = await http().post(`/api/v1/users/${a.id}/disable`).set(bearer(tc)).send({});
      expect(res.status).toBe(200); // c is active, so a is not the last
    });

    it('rolls back the status change and the session revocation when the audit write fails', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const targetToken = await loginToken(app, target.email);
      const spy = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValueOnce(new Error('audit down'));
      try {
        expect(
          (await http().post(`/api/v1/users/${target.id}/disable`).set(bearer(token)).send({}))
            .status,
        ).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
        'ACTIVE',
      );
      await http().get('/api/v1/auth/me').set(bearer(targetToken)).expect(200);
    });

    it('404 for an unknown user; reason is optional but validated', async () => {
      const { token } = await directorActor();
      const target = await createUser(app, { roles: [SystemRoleKey.Finance] });
      expect(
        (
          await http()
            .post('/api/v1/users/0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60/disable')
            .set(bearer(token))
            .send({})
        ).status,
      ).toBe(404);
      expect(
        (
          await http()
            .post(`/api/v1/users/${target.id}/disable`)
            .set(bearer(token))
            .send({ reason: 'x'.repeat(501) })
        ).status,
      ).toBe(400);
      expect(
        (
          await http()
            .post(`/api/v1/users/${target.id}/disable`)
            .set(bearer(token))
            .send({ status: 'ACTIVE' })
        ).status,
      ).toBe(400);
    });
  });
});
