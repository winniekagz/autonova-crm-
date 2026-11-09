import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QuotationsUseCases } from '../src/modules/quotations/application/quotations.use-cases.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp } from './helpers.js';
import { salesKit } from './sales-kit.js';

describe('quotations, conversion boundary and pipeline summary (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, qualifiedLead, torUrl, createTor, sign } = salesKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const qUrl = (leadId: string) => `/api/v1/leads/${leadId}/quotations`;
  const sentTor = async () => {
    const ctx = await qualifiedLead();
    await createTor(ctx.owner.token, ctx.lead.id).expect(201);
    await http()
      .post(`${torUrl(ctx.lead.id)}/send`)
      .set(bearer(ctx.owner.token))
      .expect(200);
    return ctx;
  };
  const status = (token: string, leadId: string, id: string, to: string) =>
    http()
      .post(`${qUrl(leadId)}/${id}/status`)
      .set(bearer(token))
      .send({ status: to });

  describe('from a ToR version', () => {
    it('copies the stored figures of the latest sent version, numbers it, dates it and links the version', async () => {
      const { owner, lead } = await sentTor();
      const res = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.number).toMatch(/^QT-\d{4}-\d{4}$/);
      expect(res.body).toMatchObject({
        kind: 'FROM_TOR',
        status: 'DRAFT',
        torVersionNo: 1,
        currency: 'KES',
      });
      expect(res.body.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.totals).toMatchObject({
        oneOffSubtotal: '155000.00',
        vatOneOff: '24800.00',
        totalOneOff: '179800.00',
        recurringTotal: '5800.00',
      });
      const tor = await http().get(torUrl(lead.id)).set(bearer(owner.token));
      expect(res.body.torVersionId).toBe(tor.body.current.id);
      expect(res.body.lines.map((l: { description: string }) => l.description)).toEqual([
        'Setup and development fee',
        'Point of sale',
        'Staff training',
      ]);
    });

    it('keeps the quote’s figures when the ToR later moves to a new version', async () => {
      const { owner, lead } = await sentTor();
      const first = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token))
        .expect(201);
      const again = await http()
        .get(`${qUrl(lead.id)}/${first.body.id}`)
        .set(bearer(owner.token));
      expect(again.body).toMatchObject({ torVersionNo: 1, totals: { totalOneOff: '179800.00' } });
    });

    it('needs a ToR that has been sent, and refuses a lead with none', async () => {
      const { owner, lead } = await qualifiedLead();
      const none = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      expect(none.status).toBe(409);
      expect(none.body.code).toBe('QUOTATION_NO_TOR');
      await createTor(owner.token, lead.id).expect(201);
      const draft = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      expect(draft.status).toBe(409);
      expect(draft.body.code).toBe('QUOTATION_TOR_NOT_SENT');
    });

    it('gives every quote a unique number, even when created at the same moment', async () => {
      const { owner, lead } = await sentTor();
      const made = await Promise.all(
        [1, 2, 3, 4].map(() =>
          http()
            .post(`${qUrl(lead.id)}/from-tor`)
            .set(bearer(owner.token))
            .send({}),
        ),
      );
      expect(made.every((r) => r.status === 201)).toBe(true);
      const numbers = made.map((r) => r.body.number as string);
      expect(new Set(numbers).size).toBe(4);
    });

    it('rejects a validity date in the past', async () => {
      const { owner, lead } = await sentTor();
      const res = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({ validUntil: '2020-01-01' });
      expect(res.status).toBe(400);
    });
  });

  describe('quick quote', () => {
    const quick = (over: Record<string, unknown> = {}) => ({
      currency: 'USD',
      vatTreatment: 'APPLIED',
      discountType: 'NONE',
      discountValue: '0',
      hostingAmount: '0',
      lines: [
        { description: 'Setup', quantity: '1', unitPrice: '1000.00' },
        { description: 'Training day', quantity: '2.5', unitPrice: '200.00' },
      ],
      ...over,
    });

    it('prices a standalone quote on the server', async () => {
      const { owner, lead } = await qualifiedLead();
      const res = await http()
        .post(`${qUrl(lead.id)}/quick`)
        .set(bearer(owner.token))
        .send(quick());
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({
        kind: 'QUICK',
        torVersionId: null,
        torVersionNo: null,
        currency: 'USD',
      });
      expect(res.body.totals).toMatchObject({
        oneOffSubtotal: '1500.00',
        vatOneOff: '240.00',
        totalOneOff: '1740.00',
      });
      expect(res.body.lines.map((l: { lineTotal: string }) => l.lineTotal)).toEqual([
        '1000.00',
        '500.00',
      ]);
    });

    it('refuses totals from the client and nonsense amounts', async () => {
      const { owner, lead } = await qualifiedLead();
      const forged = await http()
        .post(`${qUrl(lead.id)}/quick`)
        .set(bearer(owner.token))
        .send({ ...quick(), totalOneOff: '1.00' });
      expect(forged.status).toBe(400);
      for (const over of [
        { lines: [] },
        { lines: [{ description: 'x', quantity: '0', unitPrice: '1' }] },
        { lines: [{ description: 'x', quantity: '1', unitPrice: '-5' }] },
        { discountType: 'AMOUNT', discountValue: '999999.00' },
        { hostingAmount: '10', hostingCycle: null },
      ]) {
        const res = await http()
          .post(`${qUrl(lead.id)}/quick`)
          .set(bearer(owner.token))
          .send(quick(over));
        expect(res.status, JSON.stringify(over)).toBe(400);
      }
      expect(await prisma.quotation.count({ where: { leadId: lead.id } })).toBe(0);
    });
  });

  describe('lifecycle', () => {
    const draft = async () => {
      const ctx = await sentTor();
      const q = await http()
        .post(`${qUrl(ctx.lead.id)}/from-tor`)
        .set(bearer(ctx.owner.token))
        .send({});
      return { ...ctx, quote: q.body as { id: string } };
    };

    it('moves draft to sent to accepted and refuses skipping or going back', async () => {
      const { owner, lead, quote } = await draft();
      const skip = await status(owner.token, lead.id, quote.id, 'ACCEPTED');
      expect(skip.status).toBe(409);
      expect(skip.body.code).toBe('QUOTATION_INVALID_TRANSITION');
      const sent = await status(owner.token, lead.id, quote.id, 'SENT');
      expect(sent.body).toMatchObject({ status: 'SENT' });
      expect(sent.body.sentAt).toBeTruthy();
      const accepted = await status(owner.token, lead.id, quote.id, 'ACCEPTED');
      expect(accepted.body).toMatchObject({ status: 'ACCEPTED' });
      expect(accepted.body.decidedAt).toBeTruthy();
      expect((await status(owner.token, lead.id, quote.id, 'SENT')).status).toBe(409);
      expect((await status(owner.token, lead.id, quote.id, 'REJECTED')).status).toBe(409);
      expect((await status(owner.token, lead.id, quote.id, 'EXPIRED')).status).toBe(409);
    });

    it('can be rejected after sending, and EXPIRED cannot be chosen by a person', async () => {
      const { owner, lead, quote } = await draft();
      await status(owner.token, lead.id, quote.id, 'SENT').expect(200);
      expect((await status(owner.token, lead.id, quote.id, 'EXPIRED')).status).toBe(409);
      expect((await status(owner.token, lead.id, quote.id, 'REJECTED')).body.status).toBe(
        'REJECTED',
      );
    });

    it('freezes a sent quote in the database', async () => {
      const { owner, lead, quote } = await draft();
      await status(owner.token, lead.id, quote.id, 'SENT').expect(200);
      await expect(
        prisma.quotation.update({ where: { id: quote.id }, data: { totalOneOff: '1.00' } }),
      ).rejects.toThrow();
      await expect(
        prisma.quotationLine.updateMany({
          where: { quotationId: quote.id },
          data: { unitPrice: '1.00' },
        }),
      ).rejects.toThrow();
      await expect(prisma.quotation.delete({ where: { id: quote.id } })).rejects.toThrow();
    });

    it('expires an open quote past its date: shown as expired, refused for acceptance, and swept by the system', async () => {
      const { owner, lead, quote } = await draft();
      // A sent quote is frozen, so simulate "time passed" by dating a draft in the past and marking it
      // sent directly. The API itself never lets a past date through.
      await prisma.$executeRaw`UPDATE "quotations" SET "valid_until" = DATE '2020-01-01' WHERE "id" = ${quote.id}::uuid`;
      await prisma.$executeRaw`UPDATE "quotations" SET "status" = 'SENT', "sent_at" = now() WHERE "id" = ${quote.id}::uuid`;
      const read = await http()
        .get(`${qUrl(lead.id)}/${quote.id}`)
        .set(bearer(owner.token));
      expect(read.body).toMatchObject({ status: 'SENT', expired: true });
      const late = await status(owner.token, lead.id, quote.id, 'ACCEPTED');
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('QUOTATION_EXPIRED');
      const swept = await app.get(QuotationsUseCases).expireDue(500);
      expect(swept).toBeGreaterThanOrEqual(1);
      const after = await http()
        .get(`${qUrl(lead.id)}/${quote.id}`)
        .set(bearer(owner.token));
      expect(after.body).toMatchObject({ status: 'EXPIRED' });
      expect(await app.get(QuotationsUseCases).expireDue(500)).toBe(0);
    });

    it('needs a valid date and some lines to send', async () => {
      const { owner, lead, quote } = await draft();
      await prisma.$executeRaw`UPDATE "quotations" SET "valid_until" = DATE '2020-01-01' WHERE "id" = ${quote.id}::uuid`;
      const res = await status(owner.token, lead.id, quote.id, 'SENT');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('QUOTATION_ALREADY_PAST');
    });
  });

  describe('acceptance is not conversion', () => {
    it('accepting a quote leaves the lead and the ToR exactly as they were and creates no client account', async () => {
      const { owner, lead } = await sentTor();
      const q = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      await status(owner.token, lead.id, q.body.id, 'SENT').expect(200);
      await status(owner.token, lead.id, q.body.id, 'ACCEPTED').expect(200);
      const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(row.stage).toBe('TOR_QUOTE_SENT');
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(0);
      const tor = await http().get(torUrl(lead.id)).set(bearer(owner.token));
      expect(tor.body).toMatchObject({ signed: false, clientAccountId: null });
      expect(tor.body.current.status).toBe('SENT');
    });

    it('only both signatures on the same version convert the deal, in the same flow', async () => {
      const { owner, lead } = await sentTor();
      const q = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      await status(owner.token, lead.id, q.body.id, 'SENT').expect(200);
      await status(owner.token, lead.id, q.body.id, 'ACCEPTED').expect(200);
      const dir = await user(SystemRoleKey.Director);
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
        'TOR_QUOTE_SENT',
      );
      const done = await sign(dir.token, lead.id, 1, 'AUTONOVA');
      expect(done.body.converted).toBe(true);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe('WON');
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(1);
    });
  });

  describe('authorization and PDF', () => {
    it('hides quotations from people who cannot see the lead, and from roles without the permission', async () => {
      const { owner, lead } = await sentTor();
      const q = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      const stranger = await user();
      expect((await http().get(qUrl(lead.id)).set(bearer(stranger.token))).status).toBe(404);
      expect(
        (
          await http()
            .get(`${qUrl(lead.id)}/${q.body.id}`)
            .set(bearer(stranger.token))
        ).status,
      ).toBe(404);
      expect((await status(stranger.token, lead.id, q.body.id, 'SENT')).status).toBe(404);
      for (const role of [SystemRoleKey.Finance, SystemRoleKey.TechnicalLead]) {
        const { token } = await user(role);
        expect((await http().get(qUrl(lead.id)).set(bearer(token))).status).toBe(403);
        expect(
          (
            await http()
              .post(`${qUrl(lead.id)}/quick`)
              .set(bearer(token))
              .send({})
          ).status,
        ).toBe(403);
      }
      // A quote id is only found through its own lead.
      const other = await qualifiedLead();
      expect(
        (
          await http()
            .get(`${qUrl(other.lead.id)}/${q.body.id}`)
            .set(bearer(other.owner.token))
        ).status,
      ).toBe(404);
    });

    it('produces a PDF from saved data', async () => {
      const { owner, lead } = await sentTor();
      const q = await http()
        .post(`${qUrl(lead.id)}/from-tor`)
        .set(bearer(owner.token))
        .send({});
      const pdf = await http()
        .get(`${qUrl(lead.id)}/${q.body.id}/pdf`)
        .set(bearer(owner.token))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.headers['content-disposition']).toContain(q.body.number);
    });
  });

  describe('pipeline summary', () => {
    it('counts only what the caller may see and reflects the lifecycle', async () => {
      const mine = await sentTor();
      const theirs = await sentTor();
      const dir = await user(SystemRoleKey.Director);
      await sign(mine.owner.token, mine.lead.id, 1, 'CLIENT').expect(200);
      await sign(dir.token, mine.lead.id, 1, 'AUTONOVA').expect(200);
      const bd = await http().get('/api/v1/pipeline/summary').set(bearer(mine.owner.token));
      expect(bd.status).toBe(200);
      expect(bd.body).toMatchObject({ won: 1, signedDeals: 1, torsAwaitingSignature: 0 });
      const stages = Object.fromEntries(
        bd.body.stages.map((s: { stage: string; count: number }) => [s.stage, s.count]),
      );
      expect(stages).toMatchObject({ WON: 1, TOR_QUOTE_SENT: 0 });
      const other = await http().get('/api/v1/pipeline/summary').set(bearer(theirs.owner.token));
      expect(other.body).toMatchObject({ won: 0, torsAwaitingSignature: 1 });
      const all = await http().get('/api/v1/pipeline/summary').set(bearer(dir.token));
      expect(all.body.won).toBeGreaterThanOrEqual(1);
      expect(all.body.torsAwaitingSignature).toBeGreaterThanOrEqual(1);
      expect((await http().get('/api/v1/pipeline/summary')).status).toBe(401);
    });
  });
});
