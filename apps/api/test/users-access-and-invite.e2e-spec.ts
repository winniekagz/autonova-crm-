import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PASSWORD,
  bearer,
  createApp,
  createUser,
  login,
  loginToken,
  loginVerifiedToken,
  uniqueEmail,
} from './helpers.js';
import { SENSITIVE, useDirectorIsolation } from './users-fixtures.js';

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

  const { directorActor, ownedIds } = useDirectorIsolation(
    () => app,
    () => prisma,
  );
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

      const director = await prisma.user.findFirstOrThrow({ where: { id: { in: ownedIds() } } });
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
});
