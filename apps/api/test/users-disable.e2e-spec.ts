import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
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

  const { directorActor, own } = useDirectorIsolation(
    () => app,
    () => prisma,
  );
  const invite = (token: string, body: object) =>
    http().post('/api/v1/users').set(bearer(token)).send(body);

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
      own(b.id);
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
      own(b.id);
      await http().post(`/api/v1/users/${b.id}/disable`).set(bearer(ta)).send({}).expect(200);

      // b is disabled: a is the last active Director, so a third party disabling a would be refused.
      const c = await createUser(app, { roles: [SystemRoleKey.Director] });
      own(c.id);
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
