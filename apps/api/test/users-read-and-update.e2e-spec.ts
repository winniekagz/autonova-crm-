import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, createUser } from './helpers.js';
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

  const { directorActor } = useDirectorIsolation(
    () => app,
    () => prisma,
  );

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
});
