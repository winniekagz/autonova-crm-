import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, createUser, loginToken, loginVerifiedToken } from './helpers.js';
import { useDirectorIsolation } from './users-fixtures.js';

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

  const { directorActor, own } = useDirectorIsolation(
    () => app,
    () => prisma,
  );

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
      own(b.id);
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
      own(b.id);
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
});
