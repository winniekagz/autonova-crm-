import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('lead relationships and migration backfill (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, tag, user, makeCompany, makeContact, makeLead } = companyKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('lead relationships', () => {
    it('lets many leads share one company, and shows each person only their own leads there', async () => {
      const a = await user();
      const b = await user();
      const director = await user(SystemRoleKey.Director);
      const shared = await makeCompany(director.token);
      const contact = await makeContact(director.token, shared.id, {
        name: 'Decision Maker',
        isDecisionMaker: true,
      });
      await makeLead(director.token, { companyId: shared.id, primaryContactId: contact.id });

      // A BD user cannot link a lead to a company they cannot see
      const refused = await http().post('/api/v1/leads').set(bearer(a.token)).send({
        name: 'x',
        source: 'WEBSITE',
        currency: 'KES',
        nextAction: 'x',
        nextActionAt: '2030-01-01T08:00:00.000Z',
        companyId: shared.id,
      });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('LEAD_COMPANY_UNAVAILABLE');

      const own = await makeCompany(a.token);
      const l1 = await makeLead(a.token, { companyId: own.id });
      const l2 = await makeLead(a.token, { companyId: own.id });
      expect(l1.id).not.toBe(l2.id);
      const aLeads = await http().get(`/api/v1/companies/${own.id}/leads`).set(bearer(a.token));
      expect(aLeads.body.total).toBe(2);
      expect(
        (await http().get(`/api/v1/companies/${own.id}`).set(bearer(a.token))).body.leadCount,
      ).toBe(2);
      const dirLeads = await http()
        .get(`/api/v1/companies/${own.id}/leads`)
        .set(bearer(director.token));
      expect(dirLeads.body.total).toBe(2);
      expect((await http().get(`/api/v1/companies/${own.id}`).set(bearer(b.token))).status).toBe(
        404,
      );
    });

    it('exposes the company and contacts on the lead and keeps the company name single-sourced', async () => {
      const { token } = await user();
      const owned = await makeCompany(token, { name: `Single Source ${tag()}` });
      const primary = await makeContact(token, owned.id, { name: 'Primary', jobTitle: 'CEO' });
      const extra = await makeContact(token, owned.id, { name: 'Extra' });
      const lead = await makeLead(token, {
        companyId: owned.id,
        primaryContactId: primary.id,
        additionalContactIds: [extra.id],
      });
      const read = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(token));
      expect(read.body).toMatchObject({
        companyName: owned.name,
        company: { id: owned.id, name: owned.name, archived: false },
        primaryContact: { id: primary.id, name: 'Primary', jobTitle: 'CEO' },
        additionalContacts: [expect.objectContaining({ id: extra.id, name: 'Extra' })],
      });
      const renamed = await http()
        .patch(`/api/v1/companies/${owned.id}`)
        .set(bearer(token))
        .send({ name: `Renamed ${tag()}` });
      const after = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(token));
      expect(after.body.companyName).toBe(renamed.body.name);
      const search = await http()
        .get(`/api/v1/leads?q=${encodeURIComponent(renamed.body.name)}`)
        .set(bearer(token));
      expect(search.body.items.map((l: { id: string }) => l.id)).toContain(lead.id);
    });

    it('supports individual prospects and rejects contacts without a company', async () => {
      const { token } = await user();
      const solo = await makeLead(token);
      expect(solo).toBeTruthy();
      const read = await http().get(`/api/v1/leads/${solo.id}`).set(bearer(token));
      expect(read.body).toMatchObject({
        company: null,
        primaryContact: null,
        additionalContacts: [],
      });
      const owned = await makeCompany(token);
      const contact = await makeContact(token, owned.id);
      const orphan = await http()
        .patch(`/api/v1/leads/${solo.id}/relationships`)
        .set(bearer(token))
        .send({ companyId: null, primaryContactId: contact.id, additionalContactIds: [] });
      expect(orphan.status).toBe(400);
    });

    it('rejects contacts of another company, archived contacts and unknown ids, without telling which', async () => {
      const { token } = await user();
      const one = await makeCompany(token);
      const two = await makeCompany(token);
      const foreign = await makeContact(token, two.id);
      const mine = await makeContact(token, one.id);
      const gone = await makeContact(token, one.id);
      const director = await user(SystemRoleKey.Director);
      await http()
        .post(`/api/v1/contacts/${gone.id}/archive`)
        .set(bearer(director.token))
        .send({})
        .expect(200);
      const unknown = '0192f1a0-0000-7000-8000-00000000beef';
      const lead = await makeLead(token, { companyId: one.id });
      const set = (body: object) =>
        http().patch(`/api/v1/leads/${lead.id}/relationships`).set(bearer(token)).send(body);
      for (const primaryContactId of [foreign.id, gone.id, unknown]) {
        const res = await set({ companyId: one.id, primaryContactId, additionalContactIds: [] });
        expect(res.status, primaryContactId).toBe(409);
        expect(res.body.code).toBe('LEAD_CONTACT_UNAVAILABLE');
      }
      expect(
        (
          await set({
            companyId: one.id,
            primaryContactId: mine.id,
            additionalContactIds: [mine.id],
          })
        ).status,
      ).toBe(400);
      const ok = await set({
        companyId: one.id,
        primaryContactId: mine.id,
        additionalContactIds: [],
      });
      expect(ok.status).toBe(200);
    });

    it('re-links a lead atomically, audits it, and rolls everything back when the change is refused', async () => {
      const { token, user: bd } = await user();
      const one = await makeCompany(token);
      const two = await makeCompany(token);
      const c1 = await makeContact(token, one.id);
      const c2 = await makeContact(token, one.id);
      const lead = await makeLead(token, {
        companyId: one.id,
        primaryContactId: c1.id,
        additionalContactIds: [c2.id],
      });
      const set = (body: object) =>
        http().patch(`/api/v1/leads/${lead.id}/relationships`).set(bearer(token)).send(body);

      const refused = await set({
        companyId: two.id,
        primaryContactId: c1.id,
        additionalContactIds: [],
      });
      expect(refused.status).toBe(409);
      const unchanged = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(token));
      expect(unchanged.body.company.id).toBe(one.id);
      expect(unchanged.body.primaryContact.id).toBe(c1.id);
      expect(unchanged.body.additionalContacts).toHaveLength(1);

      const moved = await set({
        companyId: two.id,
        primaryContactId: null,
        additionalContactIds: [],
      });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({
        company: { id: two.id },
        primaryContact: null,
        additionalContacts: [],
      });
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: lead.id, action: 'lead.relationships_changed' },
      });
      expect(audit).toMatchObject({ actorUserId: bd.id });
      expect(audit?.oldValues).toEqual({
        companyId: one.id,
        primaryContactId: c1.id,
        additionalContactCount: 1,
      });
      expect(audit?.newValues).toEqual({
        companyId: two.id,
        primaryContactId: null,
        additionalContactCount: 0,
      });

      const solo = await set({ companyId: null, primaryContactId: null, additionalContactIds: [] });
      expect(solo.body.company).toBeNull();
    });

    it('rolls the lead back when a database check rejects part of a relink', async () => {
      const { token } = await user();
      const one = await makeCompany(token);
      const c1 = await makeContact(token, one.id);
      const lead = await makeLead(token, { companyId: one.id, primaryContactId: c1.id });
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.leadContact.deleteMany({ where: { leadId: lead.id } });
          await tx.lead.update({ where: { id: lead.id }, data: { companyId: null } });
        }),
      ).rejects.toThrow();
      const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(row.companyId).toBe(one.id);
      expect(row.primaryContactId).toBe(c1.id);
    });

    it('lets only the lead owner (or a Director) change a lead’s links', async () => {
      const owner = await user();
      const other = await user();
      const own = await makeCompany(owner.token);
      const lead = await makeLead(owner.token);
      const res = await http()
        .patch(`/api/v1/leads/${lead.id}/relationships`)
        .set(bearer(other.token))
        .send({ companyId: own.id, primaryContactId: null, additionalContactIds: [] });
      expect([404, 409]).toContain(res.status);
      const read = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(owner.token));
      expect(read.body.company).toBeNull();
      const finance = await user(SystemRoleKey.Finance);
      expect(
        (
          await http()
            .patch(`/api/v1/leads/${lead.id}/relationships`)
            .set(bearer(finance.token))
            .send({ companyId: null, primaryContactId: null, additionalContactIds: [] })
        ).status,
      ).toBe(403);
    });
  });

  describe('migration backfill', () => {
    it('keeps every legacy company text and links unambiguous names', async () => {
      // The e2e database is built by running every migration from scratch, so the backfill ran on an
      // empty leads table. Re-run its SQL here against rows created the old way to prove its behaviour.
      const { user: bd } = await user();
      const stem = `Legacy ${tag()}`;
      const ids: string[] = [];
      for (const [name, key] of [
        [`${stem} Ltd`, stem.toLowerCase()],
        [`${stem.toUpperCase()} Limited`, stem.toLowerCase()],
        [`Solo ${stem}`, `solo ${stem.toLowerCase()}`],
      ] as const) {
        const row = await prisma.lead.create({
          data: {
            name: 'legacy',
            source: 'WEBSITE',
            currency: 'KES',
            nextAction: 'x',
            nextActionAt: new Date(),
            ownerUserId: bd.id,
            createdByUserId: bd.id,
            companyName: name,
            companyNameNormalized: key,
          },
        });
        ids.push(row.id);
      }
      const inserted = await prisma.$executeRawUnsafe(`
        WITH keyed AS (
          SELECT "id", "company_name", "company_name_normalized" AS key, "created_by_user_id", "created_at"
            FROM "leads" WHERE "id" IN (${ids.map((id) => `'${id}'`).join(',')}) AND "company_name_normalized" IS NOT NULL
        ), grouped AS (
          SELECT key, (ARRAY_AGG(BTRIM("company_name") ORDER BY "created_at", "id"))[1] AS name,
                 (ARRAY_AGG("created_by_user_id" ORDER BY "created_at", "id"))[1] AS created_by,
                 COUNT(DISTINCT LOWER(REGEXP_REPLACE(BTRIM("company_name"), '\\s+', ' ', 'g'))) > 1 AS differ
            FROM keyed GROUP BY key)
        INSERT INTO "companies" ("id", "name", "name_normalized", "created_by_user_id", "updated_by_user_id", "needs_review", "updated_at")
        SELECT gen_random_uuid(), name, key, created_by, created_by, differ, CURRENT_TIMESTAMP FROM grouped`);
      expect(inserted).toBe(2);
      const created = await prisma.company.findMany({
        where: { nameNormalized: { in: [stem.toLowerCase(), `solo ${stem.toLowerCase()}`] } },
      });
      expect(created.find((c) => c.nameNormalized === stem.toLowerCase())?.needsReview).toBe(true);
      expect(created.find((c) => c.nameNormalized.startsWith('solo'))?.needsReview).toBe(false);
      const texts = await prisma.lead.findMany({
        where: { id: { in: ids } },
        select: { companyName: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(texts.map((t) => t.companyName)).toEqual([
        `${stem} Ltd`,
        `${stem.toUpperCase()} Limited`,
        `Solo ${stem}`,
      ]);
    });
  });
});
