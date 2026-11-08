import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('company visibility, authorization and archiving (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, tag, pin, user, company, makeCompany, makeContact, makeLead } = companyKit(
    () => app,
  );
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('visibility and authorization', () => {
    it('shows a BD user only companies they created or that hold one of their leads; Directors see all', async () => {
      const a = await user();
      const b = await user();
      const director = await user(SystemRoleKey.Director);
      const aCompany = await makeCompany(a.token);
      const bCompany = await makeCompany(b.token);
      const shared = await makeCompany(director.token);
      await makeLead(b.token, { companyId: undefined });

      expect(
        (await http().get(`/api/v1/companies/${aCompany.id}`).set(bearer(a.token))).status,
      ).toBe(200);
      expect(
        (await http().get(`/api/v1/companies/${bCompany.id}`).set(bearer(a.token))).status,
      ).toBe(404);
      expect((await http().get(`/api/v1/companies/${shared.id}`).set(bearer(a.token))).status).toBe(
        404,
      );
      const list = await http().get('/api/v1/companies?pageSize=100').set(bearer(a.token));
      const ids = list.body.items.map((c: { id: string }) => c.id);
      expect(ids).toContain(aCompany.id);
      expect(ids).not.toContain(bCompany.id);
      expect(ids).not.toContain(shared.id);

      const all = await http().get('/api/v1/companies?pageSize=100').set(bearer(director.token));
      expect(all.body.items.map((c: { id: string }) => c.id)).toEqual(
        expect.arrayContaining([aCompany.id, bCompany.id, shared.id]),
      );

      // a company becomes visible once the user owns a lead at it, and is never described before that
      await prisma.lead.updateMany({ where: { createdByUserId: b.user.id }, data: {} });
      const link = await http().post('/api/v1/leads').set(bearer(director.token)).send({
        name: 'Dir lead',
        source: 'WEBSITE',
        currency: 'KES',
        nextAction: 'x',
        nextActionAt: '2030-01-01T08:00:00.000Z',
        companyId: shared.id,
      });
      expect(link.status).toBe(201);
      expect((await http().get(`/api/v1/companies/${shared.id}`).set(bearer(a.token))).status).toBe(
        404,
      );
    });

    it('denies roles without grants, unauthenticated callers and BD archiving', async () => {
      const finance = await user(SystemRoleKey.Finance);
      const technical = await user(SystemRoleKey.TechnicalLead);
      const bd = await user();
      const owned = await makeCompany(bd.token);
      for (const token of [finance.token, technical.token]) {
        expect((await http().get('/api/v1/companies').set(bearer(token))).status).toBe(403);
        expect(
          (await http().post('/api/v1/companies').set(bearer(token)).send(company())).status,
        ).toBe(403);
        expect(
          (await http().get(`/api/v1/companies/${owned.id}/contacts`).set(bearer(token))).status,
        ).toBe(403);
      }
      expect((await http().get('/api/v1/companies')).status).toBe(401);
      expect(
        (await http().post(`/api/v1/companies/${owned.id}/archive`).set(bearer(bd.token)).send({}))
          .status,
      ).toBe(403);
      expect(
        (await http().post(`/api/v1/companies/${owned.id}/restore`).set(bearer(bd.token)).send({}))
          .status,
      ).toBe(403);
    });

    it('reports an invisible company exactly like a missing one, through every nested route', async () => {
      const owner = await user();
      const stranger = await user();
      const target = await makeCompany(owner.token);
      const contact = await makeContact(owner.token, target.id);
      const missing = '0192f1a0-0000-7000-8000-00000000dead';
      const probe = async (
        path: (id: string) => string,
        method: 'get' | 'post' | 'patch',
        body?: object,
      ) => {
        const a = await http()[method](path(target.id)).set(bearer(stranger.token)).send(body);
        const b = await http()[method](path(missing)).set(bearer(stranger.token)).send(body);
        expect(a.status, path(target.id)).toBe(404);
        expect(b.status).toBe(404);
        expect(a.body.code).toBe(b.body.code);
      };
      await probe((id) => `/api/v1/companies/${id}`, 'get');
      await probe((id) => `/api/v1/companies/${id}/contacts`, 'get');
      await probe((id) => `/api/v1/companies/${id}/leads`, 'get');
      await probe((id) => `/api/v1/companies/${id}`, 'patch', { location: 'x' });
      await probe((id) => `/api/v1/companies/${id}/contacts`, 'post', {
        name: 'x',
        isDecisionMaker: false,
      });
      expect(
        (await http().get(`/api/v1/contacts/${contact.id}`).set(bearer(stranger.token))).status,
      ).toBe(404);
      expect(
        (
          await http()
            .patch(`/api/v1/contacts/${contact.id}`)
            .set(bearer(stranger.token))
            .send({ name: 'Hacked' })
        ).status,
      ).toBe(404);
      const intact = await http().get(`/api/v1/contacts/${contact.id}`).set(bearer(owner.token));
      expect(intact.body.name).not.toBe('Hacked');
      expect(
        (await http().get('/api/v1/companies/not-a-uuid').set(bearer(owner.token))).status,
      ).toBe(400);
    });

    it('does not reveal an invisible company through duplicate detection, but still prevents a twin', async () => {
      const owner = await user();
      const stranger = await user();
      const kraPin = pin();
      const hidden = await makeCompany(owner.token, { kraPin, name: `Hidden ${tag()}` });
      const check = await http()
        .post('/api/v1/companies/duplicate-check')
        .set(bearer(stranger.token))
        .send({ kraPin, name: hidden.name });
      expect(check.body.exact).toEqual([]);
      expect(check.body.hiddenMatchCount).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(check.body)).not.toContain(hidden.name);
      const blocked = await http()
        .post('/api/v1/companies')
        .set(bearer(stranger.token))
        .send(company({ kraPin }));
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('COMPANY_KRA_PIN_EXISTS');
      expect(JSON.stringify(blocked.body)).not.toContain(hidden.name);
    });
  });

  describe('archiving companies', () => {
    it('refuses while open leads exist, keeps history, releases the KRA PIN, and restores safely', async () => {
      const director = await user(SystemRoleKey.Director);
      const kraPin = pin();
      const owned = await makeCompany(director.token, { kraPin });
      const lead = await makeLead(director.token, { companyId: owned.id });
      const blocked = await http()
        .post(`/api/v1/companies/${owned.id}/archive`)
        .set(bearer(director.token))
        .send({});
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('COMPANY_HAS_OPEN_LEADS');
      expect(
        (await http().get(`/api/v1/companies/${owned.id}`).set(bearer(director.token))).body
          .archived,
      ).toBe(false);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'LOST',
          lostReason: 'x',
          lostAt: new Date(),
          lostByUserId: director.user.id,
        },
      });
      const archived = await http()
        .post(`/api/v1/companies/${owned.id}/archive`)
        .set(bearer(director.token))
        .send({ reason: 'Closed down' });
      expect(archived.body.archived).toBe(true);
      expect(
        (
          await http().get('/api/v1/companies?pageSize=100').set(bearer(director.token))
        ).body.items.map((c: { id: string }) => c.id),
      ).not.toContain(owned.id);
      expect(
        (
          await http()
            .get(`/api/v1/companies?includeArchived=true&q=${encodeURIComponent(owned.name)}`)
            .set(bearer(director.token))
        ).body.items.map((c: { id: string }) => c.id),
      ).toContain(owned.id);
      expect(
        (
          await http()
            .patch(`/api/v1/companies/${owned.id}`)
            .set(bearer(director.token))
            .send({ location: 'x' })
        ).body.code,
      ).toBe('COMPANY_ARCHIVED');
      const again = await http()
        .post(`/api/v1/companies/${owned.id}/archive`)
        .set(bearer(director.token))
        .send({});
      expect(again.status).toBe(409);

      // the PIN is free again, and the archived company is offered as a match so it can be restored
      const check = await http()
        .post('/api/v1/companies/duplicate-check')
        .set(bearer(director.token))
        .send({ kraPin });
      expect(check.body.exact).toEqual([expect.objectContaining({ id: owned.id, archived: true })]);
      const reuse = await makeCompany(director.token, {
        kraPin: undefined,
        name: `Other ${tag()}`,
      });
      expect(reuse.id).not.toBe(owned.id);
      const taken = await http()
        .post('/api/v1/companies')
        .set(bearer(director.token))
        .send(company({ kraPin }));
      expect(taken.status).toBe(409);

      const restored = await http()
        .post(`/api/v1/companies/${owned.id}/restore`)
        .set(bearer(director.token))
        .send({});
      expect(restored.body.archived).toBe(false);
      const audit = await prisma.auditLog.findMany({
        where: { entityId: owned.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audit.map((row) => row.action)).toEqual([
        'company.created',
        'company.archived',
        'company.restored',
      ]);
      expect(audit[1]?.reason).toBe('Closed down');
    });

    it('cannot be linked to new leads while archived, and companies cannot be deleted by the app role', async () => {
      const director = await user(SystemRoleKey.Director);
      const owned = await makeCompany(director.token);
      await http()
        .post(`/api/v1/companies/${owned.id}/archive`)
        .set(bearer(director.token))
        .send({})
        .expect(200);
      const res = await http().post('/api/v1/leads').set(bearer(director.token)).send({
        name: 'x',
        source: 'WEBSITE',
        currency: 'KES',
        nextAction: 'x',
        nextActionAt: '2030-01-01T08:00:00.000Z',
        companyId: owned.id,
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAD_COMPANY_ARCHIVED');
      await expect(prisma.company.delete({ where: { id: owned.id } })).rejects.toThrow();
      await expect(prisma.contact.deleteMany()).rejects.toThrow();
    });
  });
});
