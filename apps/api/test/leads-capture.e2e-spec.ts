import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LeadReminderProcessor } from '../src/modules/leads/application/lead-reminder-processor.js';
import { bearer, createApp, createUser, loginToken, loginVerifiedToken } from './helpers.js';

describe('lead capture: product catalogue, duplicates, reminders (e2e)', () => {
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

  let n = 0;
  const unique = () => {
    n += 1;
    const tag = `${Date.now().toString(36)}${n}`;
    return {
      tag,
      phone: `0722${String(100_000 + n * 7).padStart(6, '0')}`,
      company: `Capture ${tag} Ltd`,
    };
  };
  const lead = (over: Record<string, unknown> = {}) => {
    const u = unique();
    return {
      name: `Lead ${u.tag}`,
      companyName: u.company,
      phone: u.phone,
      source: 'WEBSITE',
      currency: 'KES',
      nextAction: 'Call',
      nextActionAt: '2030-01-01T08:00:00.000Z',
      ...over,
    };
  };
  const bd = async () => {
    const user = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    return { user, token: await loginToken(app, user.email) };
  };

  describe('product interest catalogue', () => {
    it('stores a catalogue value, updates it, clears it, and rejects free text', async () => {
      const { token } = await bd();
      const created = await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send(lead({ productInterest: 'CAR_WASH_AUTOMATION' }));
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        productInterest: 'CAR_WASH_AUTOMATION',
        legacyProductInterest: null,
      });

      const changed = await http()
        .patch(`/api/v1/leads/${created.body.id}`)
        .set(bearer(token))
        .send({ productInterest: 'ERP' });
      expect(changed.body.productInterest).toBe('ERP');
      const cleared = await http()
        .patch(`/api/v1/leads/${created.body.id}`)
        .set(bearer(token))
        .send({ productInterest: null });
      expect(cleared.body.productInterest).toBeNull();

      const free = await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send(lead({ productInterest: 'Retail POS' }));
      expect(free.status).toBe(400);
      expect(free.body.code).toBe('VALIDATION_FAILED');
      expect(free.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'productInterest' })]),
      );
    });

    it('rejects a non-catalogue value at the database as well', async () => {
      await expect(
        prisma.$executeRawUnsafe(`UPDATE "leads" SET "product_interest" = 'Website' WHERE false`),
      ).rejects.toThrow();
    });
  });

  describe('duplicate detection', () => {
    it('warns once, then saves when the user acknowledges; nothing is merged or overwritten', async () => {
      const { token } = await bd();
      const first = unique();
      const original = await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send(lead({ phone: '0712 345 678', companyName: first.company }));
      expect(original.status).toBe(201);

      const same = lead({ phone: '+254-712-345-678', companyName: 'someone else' });
      const warned = await http().post('/api/v1/leads').set(bearer(token)).send(same);
      expect(warned.status).toBe(409);
      expect(warned.body.code).toBe('LEAD_DUPLICATE_SUSPECTED');

      const checked = await http()
        .post('/api/v1/leads/duplicate-check')
        .set(bearer(token))
        .send({ phone: '(0712) 345-678' });
      expect(checked.status).toBe(200);
      expect(checked.body.candidates).toEqual([
        expect.objectContaining({
          id: original.body.id,
          matchedOn: ['PHONE'],
          ownerName: 'Test User',
        }),
      ]);
      expect(checked.body.hiddenMatchCount).toBe(0);

      const saved = await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send({ ...same, acknowledgeDuplicates: true });
      expect(saved.status).toBe(201);
      expect(saved.body.id).not.toBe(original.body.id);
      const untouched = await http().get(`/api/v1/leads/${original.body.id}`).set(bearer(token));
      expect(untouched.body.name).toBe(original.body.name);
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'lead', entityId: saved.body.id, action: 'lead.created' },
      });
      expect(audit?.newValues).toMatchObject({ duplicateAcknowledged: true });
    });

    it('matches company names regardless of case, spacing, punctuation and a Ltd/Limited suffix', async () => {
      const { token } = await bd();
      const u = unique();
      await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send(lead({ companyName: `Zeta ${u.tag} Limited`, phone: u.phone }));
      for (const variant of [`  ZETA   ${u.tag}  ltd.`, `zeta-${u.tag}`]) {
        const res = await http()
          .post('/api/v1/leads/duplicate-check')
          .set(bearer(token))
          .send({ companyName: variant });
        expect(res.body.candidates, variant).toHaveLength(1);
        expect(res.body.candidates[0].matchedOn).toEqual(['COMPANY']);
      }
      const other = await http()
        .post('/api/v1/leads/duplicate-check')
        .set(bearer(token))
        .send({ companyName: `Zeta ${u.tag} Holdings` });
      expect(other.body.candidates).toHaveLength(0);
    });

    it('does not warn for leads without a phone or company, or with an unusable phone', async () => {
      const { token } = await bd();
      for (let i = 0; i < 2; i += 1) {
        const res = await http()
          .post('/api/v1/leads')
          .set(bearer(token))
          .send(lead({ companyName: undefined, phone: i === 0 ? undefined : '12' }));
        expect(res.status).toBe(201);
      }
    });

    it('never describes leads the caller may not read, but still warns about them', async () => {
      const owner = await bd();
      const other = await bd();
      const phone = unique().phone;
      const hidden = await http()
        .post('/api/v1/leads')
        .set(bearer(owner.token))
        .send(lead({ phone }));
      expect(hidden.status).toBe(201);

      const check = await http()
        .post('/api/v1/leads/duplicate-check')
        .set(bearer(other.token))
        .send({ phone });
      expect(check.body).toEqual({ candidates: [], hiddenMatchCount: 1 });
      expect(JSON.stringify(check.body)).not.toContain(hidden.body.name);

      const blocked = await http()
        .post('/api/v1/leads')
        .set(bearer(other.token))
        .send(lead({ phone }));
      expect(blocked.status).toBe(409);
      expect(JSON.stringify(blocked.body)).not.toContain(hidden.body.name);

      const director = await createUser(app, { roles: [SystemRoleKey.Director] });
      const directorToken = await loginVerifiedToken(app, director.email);
      const seen = await http()
        .post('/api/v1/leads/duplicate-check')
        .set(bearer(directorToken))
        .send({ phone });
      expect(seen.body.candidates).toEqual([expect.objectContaining({ id: hidden.body.id })]);
    });

    it('checks an edit only when phone or company actually changes, and excludes the lead itself', async () => {
      const { token } = await bd();
      const a = await http().post('/api/v1/leads').set(bearer(token)).send(lead());
      const b = await http().post('/api/v1/leads').set(bearer(token)).send(lead());
      const keepNumber = await http()
        .patch(`/api/v1/leads/${a.body.id}`)
        .set(bearer(token))
        .send({ phone: a.body.phone, notes: 'same number' });
      expect(keepNumber.status).toBe(200);

      const clash = await http()
        .patch(`/api/v1/leads/${a.body.id}`)
        .set(bearer(token))
        .send({ phone: b.body.phone });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('LEAD_DUPLICATE_SUSPECTED');
      const acknowledged = await http()
        .patch(`/api/v1/leads/${a.body.id}`)
        .set(bearer(token))
        .send({ phone: b.body.phone, acknowledgeDuplicates: true });
      expect(acknowledged.status).toBe(200);

      // `a` now shares `b`'s number: each sees the other, never itself.
      const ids = async (excludeLeadId: string) =>
        (
          await http()
            .post('/api/v1/leads/duplicate-check')
            .set(bearer(token))
            .send({ phone: b.body.phone, excludeLeadId })
        ).body.candidates.map((c: { id: string }) => c.id);
      expect(await ids(a.body.id)).toEqual([b.body.id]);
      expect(await ids(b.body.id)).toEqual([a.body.id]);
    });

    it('requires the create permission and a valid body', async () => {
      const finance = await createUser(app, { roles: [SystemRoleKey.Finance] });
      const token = await loginToken(app, finance.email);
      expect(
        (
          await http()
            .post('/api/v1/leads/duplicate-check')
            .set(bearer(token))
            .send({ phone: '0712345678' })
        ).status,
      ).toBe(403);
      expect((await http().post('/api/v1/leads/duplicate-check').send({})).status).toBe(401);
      const { token: bdToken } = await bd();
      expect(
        (
          await http()
            .post('/api/v1/leads/duplicate-check')
            .set(bearer(bdToken))
            .send({ stage: 'WON' })
        ).status,
      ).toBe(400);
    });
  });

  describe('next-action reminders', () => {
    const at = new Date('2026-11-10T06:30:00.000Z');
    const due = new Date('2026-11-10T06:00:00.000Z');
    const make = async (token: string, over: Record<string, unknown> = {}) => {
      const res = await http()
        .post('/api/v1/leads')
        .set(bearer(token))
        .send(lead({ nextActionAt: due.toISOString(), ...over }));
      expect(res.status).toBe(201);
      return res.body as { id: string };
    };
    const rows = (leadId: string) =>
      prisma.leadReminder.findMany({ where: { leadId }, orderBy: { dueAt: 'asc' } });

    it('sends once to the owner, is idempotent across runs, and is audited and visible to the owner only', async () => {
      const owner = await bd();
      const other = await bd();
      const created = await make(owner.token);
      const processor = app.get(LeadReminderProcessor);

      const first = await processor.processDue(at, 500);
      expect(first.sent).toBeGreaterThanOrEqual(1);
      const again = await processor.processDue(new Date(at.getTime() + 60_000), 500);
      expect(again.sent).toBe(0);

      const stored = await rows(created.id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        status: 'SENT',
        attempts: 1,
        recipientUserId: owner.user.id,
        reason: null,
      });
      expect(stored[0]?.sentAt).toBeInstanceOf(Date);
      expect(
        await prisma.auditLog.count({
          where: { entityId: created.id, action: 'lead.reminder_sent' },
        }),
      ).toBe(1);

      const list = await http()
        .get(`/api/v1/leads/${created.id}/reminders`)
        .set(bearer(owner.token));
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          status: 'SENT',
          attempts: 1,
          dueAt: due.toISOString(),
          reason: null,
        }),
      ]);
      expect(
        (await http().get(`/api/v1/leads/${created.id}/reminders`).set(bearer(other.token))).status,
      ).toBe(404);
    });

    it('does not remind before the follow-up time, and re-reminds after the follow-up is rescheduled', async () => {
      const { token } = await bd();
      const created = await make(token, { nextActionAt: '2026-11-10T09:00:00.000Z' });
      const processor = app.get(LeadReminderProcessor);
      await processor.processDue(at, 500);
      expect(await rows(created.id)).toHaveLength(0);

      await processor.processDue(new Date('2026-11-10T09:05:00.000Z'), 500);
      expect(await rows(created.id)).toHaveLength(1);

      const moved = await http()
        .patch(`/api/v1/leads/${created.id}`)
        .set(bearer(token))
        .send({ nextActionAt: '2026-11-12T09:00:00.000Z' });
      expect(moved.status).toBe(200);
      await processor.processDue(new Date('2026-11-12T09:05:00.000Z'), 500);
      const stored = await rows(created.id);
      expect(stored.map((r) => r.status)).toEqual(['SENT', 'SENT']);
    });

    it('skips leads that are no longer active or whose follow-up changed after queueing', async () => {
      const { token } = await bd();
      const lost = await make(token);
      await prisma.lead.update({ where: { id: lost.id }, data: { stage: 'VISITS_AND_CALLS' } });
      await prisma.leadReminder.create({
        data: {
          leadId: lost.id,
          recipientUserId: (await prisma.lead.findUniqueOrThrow({ where: { id: lost.id } }))
            .ownerUserId,
          dueAt: new Date(due.getTime() - 3_600_000),
        },
      });
      const processor = app.get(LeadReminderProcessor);
      const result = await processor.processDue(at, 500);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      const skipped = (await rows(lost.id)).find((r) => r.status === 'SKIPPED');
      expect(skipped?.reason).toBe('FOLLOW_UP_CHANGED');
    });

    it('does not remind for terminal stages', async () => {
      const { token } = await bd();
      const created = await make(token);
      await prisma.lead.update({
        where: { id: created.id },
        data: {
          stage: 'LOST',
          lostReason: 'x',
          lostAt: new Date(),
          lostByUserId: (await prisma.lead.findUniqueOrThrow({ where: { id: created.id } }))
            .ownerUserId,
        },
      });
      await app.get(LeadReminderProcessor).processDue(at, 500);
      expect(await rows(created.id)).toHaveLength(0);
    });

    it('skips with a recorded reason when the owner is disabled, instead of silently dropping it', async () => {
      const owner = await bd();
      const created = await make(owner.token);
      await prisma.user.update({ where: { id: owner.user.id }, data: { status: 'DISABLED' } });
      await app.get(LeadReminderProcessor).processDue(at, 500);
      const [row] = await rows(created.id);
      expect(row).toMatchObject({ status: 'SKIPPED', reason: 'RECIPIENT_UNAVAILABLE' });
    });

    it('keeps the reminder when processors run concurrently: exactly one record and one claim per follow-up', async () => {
      const { token } = await bd();
      const created = await make(token);
      const processor = app.get(LeadReminderProcessor);
      const results = await Promise.all([1, 2, 3, 4].map(() => processor.processDue(at, 500)));
      expect(results.reduce((sum, r) => sum + r.sent, 0)).toBeGreaterThanOrEqual(1);
      const stored = await rows(created.id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'SENT', attempts: 1 });
      expect(
        await prisma.auditLog.count({
          where: { entityId: created.id, action: 'lead.reminder_sent' },
        }),
      ).toBe(1);
    });

    it('rejects an unusable delivery state at the database', async () => {
      const { token } = await bd();
      const created = await make(token);
      const ownerUserId = (await prisma.lead.findUniqueOrThrow({ where: { id: created.id } }))
        .ownerUserId;
      await expect(
        prisma.leadReminder.create({
          data: {
            leadId: created.id,
            recipientUserId: ownerUserId,
            dueAt: new Date('2031-01-01T00:00:00Z'),
            status: 'SENT',
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.leadReminder.create({
          data: {
            leadId: created.id,
            recipientUserId: ownerUserId,
            dueAt: new Date('2031-01-02T00:00:00Z'),
            status: 'FAILED',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
