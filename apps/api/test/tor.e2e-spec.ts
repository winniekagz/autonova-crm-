import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp } from './helpers.js';
import { salesKit } from './sales-kit.js';

describe('Terms of Reference (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, qualifiedLead, visitsLead, torBody, torUrl, createTor } = salesKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  const director = () => user(SystemRoleKey.Director);

  const send = (token: string, leadId: string) =>
    http()
      .post(`${torUrl(leadId)}/send`)
      .set(bearer(token));

  describe('creating and calculating', () => {
    it('creates v1 from a Qualified lead, starts scope alignment, and returns server-calculated totals', async () => {
      const { owner, lead } = await qualifiedLead();
      const res = await createTor(owner.token, lead.id);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.number).toMatch(/^TOR-\d{4}-\d{4}$/);
      const v = res.body.current;
      expect(v).toMatchObject({ versionNo: 1, status: 'DRAFT', currency: 'KES', vatRate: '16.00' });
      expect(v.totals).toEqual({
        scopeTotal: '40000.00',
        addonsTotal: '15000.00',
        oneOffSubtotal: '155000.00',
        discountAmount: '0.00',
        netOneOff: '155000.00',
        vatOneOff: '24800.00',
        totalOneOff: '179800.00',
        recurringVat: '800.00',
        recurringTotal: '5800.00',
      });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
        'SCOPE_ALIGNMENT',
      );
    });

    it('never trusts totals from the client', async () => {
      const { owner, lead } = await qualifiedLead();
      const res = await http()
        .post(torUrl(lead.id))
        .set(bearer(owner.token))
        .send({ ...torBody(), totalOneOff: '1.00', totals: { totalOneOff: '1.00' } });
      expect(res.status).toBe(400);
      expect(await prisma.tor.count({ where: { leadId: lead.id } })).toBe(0);
    });

    it('supports USD, a percentage discount below the threshold, and exempt VAT', async () => {
      const { owner, lead } = await qualifiedLead();
      const res = await createTor(owner.token, lead.id, {
        currency: 'USD',
        discountType: 'PERCENT',
        discountValue: '10',
        vatTreatment: 'EXEMPT',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.current).toMatchObject({
        currency: 'USD',
        vatTreatment: 'EXEMPT',
        discountNeedsApproval: false,
      });
      expect(res.body.current.totals).toMatchObject({
        discountAmount: '15500.00',
        netOneOff: '139500.00',
        vatOneOff: '0.00',
        totalOneOff: '139500.00',
        recurringTotal: '5000.00',
      });
    });

    it('rejects bad money, an over-large discount and a missing billing cycle with a clear error', async () => {
      const { owner, lead } = await qualifiedLead();
      const cases: [Record<string, unknown>, string][] = [
        [{ setupFee: '1e5' }, 'amount'],
        [{ setupFee: '-1' }, 'amount'],
        [{ discountType: 'AMOUNT', discountValue: '999999999.00' }, 'discount'],
        [{ discountType: 'PERCENT', discountValue: '101' }, 'discount'],
        [{ discountType: 'PERCENT', discountValue: '0' }, 'discount'],
        [{ hostingCycle: null }, 'billing cycle'],
      ];
      for (const [over, what] of cases) {
        const res = await createTor(owner.token, lead.id, over);
        expect(res.status, what).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      expect(await prisma.tor.count({ where: { leadId: lead.id } })).toBe(0);
    });

    it('needs a Qualified lead, allows one ToR per lead, and hides other people’s leads', async () => {
      const early = await visitsLead();
      const refused = await createTor(early.owner.token, early.lead.id);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('TOR_LEAD_NOT_QUALIFIED');
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id).expect(201);
      const again = await createTor(owner.token, lead.id);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('TOR_EXISTS');
      const stranger = await user();
      expect((await http().get(torUrl(lead.id)).set(bearer(stranger.token))).status).toBe(404);
      expect((await createTor(stranger.token, lead.id)).status).toBe(404);
    });
  });

  describe('catalogue', () => {
    it('lets a Director manage items, copies them into a ToR, and later edits never change that ToR', async () => {
      const dir = await director();
      const item = await http().post('/api/v1/catalogue').set(bearer(dir.token)).send({
        name: 'Inventory module',
        defaultDays: '4',
        defaultPrice: '25000.00',
        currency: 'KES',
      });
      expect(item.status, JSON.stringify(item.body)).toBe(201);
      const { owner, lead } = await qualifiedLead();
      const created = await createTor(owner.token, lead.id, {
        scopeItems: [{ catalogueItemId: item.body.id, inScope: true }],
        addons: [],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.current.scopeItems[0]).toMatchObject({
        name: 'Inventory module',
        estimateDays: '4.00',
        price: '25000.00',
        catalogueItemId: item.body.id,
      });
      await http()
        .put(`/api/v1/catalogue/${item.body.id}`)
        .set(bearer(dir.token))
        .send({
          name: 'Inventory (renamed)',
          defaultDays: '9',
          defaultPrice: '99999.00',
          currency: 'KES',
        })
        .expect(200);
      const after = await http().get(torUrl(lead.id)).set(bearer(owner.token));
      expect(after.body.current.scopeItems[0]).toMatchObject({
        name: 'Inventory module',
        price: '25000.00',
      });
      expect(after.body.current.totals.scopeTotal).toBe('25000.00');
    });

    it('is Director-only to change and refuses an inactive or unknown item', async () => {
      const { owner, lead } = await qualifiedLead();
      const bdTry = await http()
        .post('/api/v1/catalogue')
        .set(bearer(owner.token))
        .send({ name: 'x', defaultDays: '1', defaultPrice: '1', currency: 'KES' });
      expect(bdTry.status).toBe(403);
      expect((await http().get('/api/v1/catalogue').set(bearer(owner.token))).status).toBe(200);
      const dir = await director();
      const item = await http()
        .post('/api/v1/catalogue')
        .set(bearer(dir.token))
        .send({ name: 'Old', defaultDays: '1', defaultPrice: '1', currency: 'KES', active: false });
      const res = await createTor(owner.token, lead.id, {
        scopeItems: [{ catalogueItemId: item.body.id, inScope: true }],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TOR_CATALOGUE_ITEM_UNAVAILABLE');
    });
  });

  describe('versions and immutability', () => {
    it('edits a draft, then freezes it on send with a content hash, and refuses further edits', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id).expect(201);
      const edited = await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(torBody({ setupFee: '120000.00' }));
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.totals.oneOffSubtotal).toBe('175000.00');
      const sent = await send(owner.token, lead.id);
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body).toMatchObject({ status: 'SENT' });
      expect(sent.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
        'TOR_QUOTE_SENT',
      );
      const frozen = await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(torBody());
      expect(frozen.status).toBe(409);
      expect(frozen.body.code).toBe('TOR_VERSION_NOT_DRAFT');
      const twice = await send(owner.token, lead.id);
      expect(twice.status).toBe(409);
      // Even a direct write cannot change a sent version: the database refuses it.
      await expect(
        prisma.torVersion.update({ where: { id: sent.body.id }, data: { setupFee: '1.00' } }),
      ).rejects.toThrow();
      await expect(
        prisma.torScopeItem.updateMany({
          where: { torVersionId: sent.body.id },
          data: { price: '1.00' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.torScopeItem.create({
          data: { torVersionId: sent.body.id, itemKey: sent.body.id, position: 9, name: 'sneaky' },
        }),
      ).rejects.toThrow();
    });

    it('refuses to send with nothing in scope', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id, {
        scopeItems: [{ name: 'Maybe later', inScope: false }],
      }).expect(201);
      const res = await send(owner.token, lead.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TOR_NOTHING_IN_SCOPE');
    });

    it('every new round is a new version; the old one stays retrievable and the diff shows dropped requests', async () => {
      const { owner, lead } = await qualifiedLead();
      const created = await createTor(owner.token, lead.id);
      const keys = created.body.current.scopeItems.map((i: { itemKey: string }) => i.itemKey);
      const v1 = await send(owner.token, lead.id);
      const earlyNew = await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token));
      expect(earlyNew.status, JSON.stringify(earlyNew.body)).toBe(201);
      expect(earlyNew.body).toMatchObject({ versionNo: 2, status: 'DRAFT' });
      const open = await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token));
      expect(open.status).toBe(409);
      expect(open.body.code).toBe('TOR_VERSION_ALREADY_OPEN');
      await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(
          torBody({
            changeSummary: 'Dropped loyalty, added reports, price change',
            scopeItems: [
              {
                itemKey: keys[0],
                name: 'Point of sale',
                inScope: true,
                estimateDays: '12',
                price: '45000.00',
              },
              { name: 'Reports', inScope: true, estimateDays: '2', price: '8000.00' },
            ],
          }),
        )
        .expect(200);
      const v2 = await send(owner.token, lead.id);
      expect(v2.body).toMatchObject({ versionNo: 2, status: 'SENT' });
      const history = await http().get(torUrl(lead.id)).set(bearer(owner.token));
      expect(
        history.body.versions.map((v: { versionNo: number; status: string }) => [
          v.versionNo,
          v.status,
        ]),
      ).toEqual([
        [2, 'SENT'],
        [1, 'SUPERSEDED'],
      ]);
      const old = await http()
        .get(`${torUrl(lead.id)}/versions/1`)
        .set(bearer(owner.token));
      expect(old.body).toMatchObject({ versionNo: 1, status: 'SUPERSEDED', setupFee: '100000.00' });
      expect(old.body.contentHash).toBe(v1.body.contentHash);
      expect(old.body.scopeItems.map((i: { name: string }) => i.name)).toContain(
        'Loyalty programme',
      );
      const diff = await http()
        .get(`${torUrl(lead.id)}/versions/1/diff/2`)
        .set(bearer(owner.token));
      expect(diff.body.scope).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'CHANGED', itemName: 'Point of sale' }),
          expect.objectContaining({ kind: 'ADDED', itemName: 'Reports' }),
          expect.objectContaining({ kind: 'REMOVED', itemName: 'Loyalty programme' }),
        ]),
      );
      await expect(prisma.torVersion.delete({ where: { id: v1.body.id } })).rejects.toThrow();
    });

    it('does not let a forged item key pass an unrelated item off as a continuation', async () => {
      const { owner, lead } = await qualifiedLead();
      const created = await createTor(owner.token, lead.id);
      const key = created.body.current.scopeItems[0].itemKey as string;
      await send(owner.token, lead.id).expect(200);
      await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token))
        .expect(201);
      const forged = '0192f1a0-0000-7000-8000-00000000beef';
      const res = await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(
          torBody({
            scopeItems: [
              { itemKey: forged, name: 'Unrelated', inScope: true, price: '1' },
              {
                itemKey: key,
                name: 'Point of sale',
                inScope: true,
                price: '40000.00',
                estimateDays: '10',
              },
            ],
          }),
        );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const keys = res.body.scopeItems.map((i: { itemKey: string }) => i.itemKey);
      expect(keys).not.toContain(forged);
      expect(keys).toContain(key);
    });
  });

  describe('discount approval', () => {
    it('cannot send an over-threshold discount until a Director approves, and an edit clears the approval', async () => {
      const { owner, lead } = await qualifiedLead();
      const created = await createTor(owner.token, lead.id, {
        discountType: 'PERCENT',
        discountValue: '15',
      });
      expect(created.body.current).toMatchObject({ discountNeedsApproval: true });
      const blocked = await send(owner.token, lead.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('TOR_DISCOUNT_APPROVAL_REQUIRED');
      const bdApprove = await http()
        .post(`${torUrl(lead.id)}/approve-discount`)
        .set(bearer(owner.token));
      expect(bdApprove.status).toBe(403);
      const dir = await director();
      const approved = await http()
        .post(`${torUrl(lead.id)}/approve-discount`)
        .set(bearer(dir.token));
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      expect(approved.body).toMatchObject({ discountNeedsApproval: false });
      expect(approved.body.discountApprovedAt).toBeTruthy();
      const edited = await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(torBody({ discountType: 'PERCENT', discountValue: '20' }));
      expect(edited.body).toMatchObject({ discountNeedsApproval: true, discountApprovedAt: null });
      expect((await send(owner.token, lead.id)).status).toBe(409);
      await http()
        .post(`${torUrl(lead.id)}/approve-discount`)
        .set(bearer(dir.token))
        .expect(200);
      expect((await send(owner.token, lead.id)).status).toBe(200);
      const audit = await prisma.auditLog.count({
        where: { action: 'tor.discount_approved', actorUserId: dir.user.id },
      });
      expect(audit).toBeGreaterThan(0);
    });

    it('allows a discount exactly at the threshold without approval', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id, {
        discountType: 'PERCENT',
        discountValue: '10',
      }).expect(201);
      expect((await send(owner.token, lead.id)).status).toBe(200);
    });
  });
});
