import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp } from './helpers.js';
import { salesKit } from './sales-kit.js';

describe('Terms of Reference: signatures and conversion (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, qualifiedLead, torBody, torUrl, createTor, sign } = salesKit(() => app);
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

  describe('signatures and conversion', () => {
    const toSent = async () => {
      const ctx = await qualifiedLead();
      await createTor(ctx.owner.token, ctx.lead.id).expect(201);
      await send(ctx.owner.token, ctx.lead.id).expect(200);
      return ctx;
    };

    it('cannot sign a draft or a version that does not exist', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id).expect(201);
      const draft = await sign(owner.token, lead.id, 1, 'CLIENT');
      expect(draft.status).toBe(409);
      expect(draft.body.code).toBe('TOR_VERSION_NOT_SENT');
      expect((await sign(owner.token, lead.id, 7, 'CLIENT')).status).toBe(404);
    });

    it('does not convert on one signature; the second party signing locks the version, wins the lead and creates exactly one client account', async () => {
      const { owner, lead } = await toSent();
      const dir = await director();
      const first = await sign(owner.token, lead.id, 1, 'CLIENT', 'Jane Client');
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body).toMatchObject({ converted: false, clientAccount: null });
      expect(first.body.version).toMatchObject({ status: 'SENT' });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
        'TOR_QUOTE_SENT',
      );
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(0);

      const second = await sign(dir.token, lead.id, 1, 'AUTONOVA', 'Wanjiru Kamau');
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(second.body).toMatchObject({ converted: true });
      expect(second.body.version).toMatchObject({ status: 'SIGNED' });
      expect(second.body.version.signatures.map((s: { party: string }) => s.party).sort()).toEqual([
        'AUTONOVA',
        'CLIENT',
      ]);
      expect(second.body.clientAccount).toMatchObject({
        leadId: lead.id,
        signedTorVersionNo: 1,
        currency: 'KES',
        billingCycle: 'MONTHLY',
        planAmount: '5000.00',
        goLiveDate: '2027-01-15',
        status: 'ACTIVE',
      });
      expect(second.body.clientAccount.number).toMatch(/^CL-\d{4}-\d{4}$/);
      expect(second.body.clientAccount.milestones.map((m: { name: string }) => m.name)).toEqual([
        'Requirements sign-off',
        'Go live',
      ]);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe('WON');
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(1);
      const won = await prisma.leadStageHistory.findFirstOrThrow({
        where: { leadId: lead.id, toStage: 'WON' },
      });
      expect(won.source).toBe('CONVERSION');
      expect(
        await prisma.auditLog.count({
          where: { action: 'client.created', entityId: second.body.clientAccount.id },
        }),
      ).toBe(1);
    });

    it('is idempotent: a repeated or racing signature never creates a second account', async () => {
      const { owner, lead } = await toSent();
      const dir = await director();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      const attempts = await Promise.all([
        sign(dir.token, lead.id, 1, 'AUTONOVA', 'A'),
        sign(dir.token, lead.id, 1, 'AUTONOVA', 'B'),
        sign(dir.token, lead.id, 1, 'AUTONOVA', 'C'),
      ]);
      const ok = attempts.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      for (const rejected of attempts.filter((r) => r.status !== 200))
        expect(rejected.status).toBe(409);
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(1);
      expect(
        await prisma.torSignature.count({ where: { version: { tor: { leadId: lead.id } } } }),
      ).toBe(2);
      const again = await sign(dir.token, lead.id, 1, 'AUTONOVA');
      expect(again.status).toBe(409);
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(1);
    });

    it('a signed version is immutable and a post-signature change is not a silent edit', async () => {
      const { owner, lead } = await toSent();
      const dir = await director();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      const done = await sign(dir.token, lead.id, 1, 'AUTONOVA');
      const id = done.body.version.id as string;
      const edit = await http()
        .put(`${torUrl(lead.id)}/draft`)
        .set(bearer(owner.token))
        .send(torBody());
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('TOR_SIGNED');
      const next = await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token));
      expect(next.status).toBe(409);
      expect(next.body.code).toBe('TOR_SIGNED');
      expect((await send(owner.token, lead.id)).status).toBe(409);
      await expect(
        prisma.torVersion.update({ where: { id }, data: { setupFee: '1.00' } }),
      ).rejects.toThrow();
      await expect(
        prisma.torVersion.update({ where: { id }, data: { status: 'SUPERSEDED' } }),
      ).rejects.toThrow();
      await expect(prisma.torVersion.delete({ where: { id } })).rejects.toThrow();
      await expect(
        prisma.torSignature.deleteMany({ where: { torVersionId: id } }),
      ).rejects.toThrow();
      await expect(
        prisma.torSignature.updateMany({ where: { torVersionId: id }, data: { signerName: 'x' } }),
      ).rejects.toThrow();
      await expect(
        prisma.torScopeItem.deleteMany({ where: { torVersionId: id } }),
      ).rejects.toThrow();
      await expect(
        prisma.clientAccount.deleteMany({ where: { leadId: lead.id } }),
      ).rejects.toThrow();
    });

    it('does not let a late signature win a lead that was marked Lost after the ToR was sent', async () => {
      const { owner, lead } = await toSent();
      await http()
        .post(`/api/v1/leads/${lead.id}/lost`)
        .set(bearer(owner.token))
        .send({ fromStage: 'TOR_QUOTE_SENT', reason: 'Client chose a competitor' })
        .expect(200);
      const dir = await director();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(409);
      const res = await sign(dir.token, lead.id, 1, 'AUTONOVA');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TOR_LEAD_CLOSED');
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe('LOST');
      expect(await prisma.clientAccount.count({ where: { leadId: lead.id } })).toBe(0);
      expect(
        await prisma.torSignature.count({ where: { version: { tor: { leadId: lead.id } } } }),
      ).toBe(0);
    });

    it('binds each signature to the sent content hash', async () => {
      const { owner, lead } = await toSent();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      const row = await prisma.torSignature.findFirstOrThrow({
        where: { version: { tor: { leadId: lead.id } } },
        include: { version: true },
      });
      expect(row.contentHash).toBe(row.version.contentHash);
    });

    it('only a Director signs for Autonova, and a stranger cannot sign at all', async () => {
      const { owner, lead } = await toSent();
      const autonovaByBd = await sign(owner.token, lead.id, 1, 'AUTONOVA');
      expect(autonovaByBd.status).toBe(403);
      expect(autonovaByBd.body.code).toBe('TOR_AUTONOVA_SIGNER_MUST_BE_DIRECTOR');
      const stranger = await user();
      expect((await sign(stranger.token, lead.id, 1, 'CLIENT')).status).toBe(404);
      expect(
        await prisma.torSignature.count({ where: { version: { tor: { leadId: lead.id } } } }),
      ).toBe(0);
    });

    it('cannot sign a superseded version', async () => {
      const { owner, lead } = await toSent();
      await http()
        .post(`${torUrl(lead.id)}/versions`)
        .set(bearer(owner.token))
        .expect(201);
      const res = await sign(owner.token, lead.id, 1, 'CLIENT');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TOR_VERSION_SUPERSEDED');
    });

    it('the database refuses a client account without both signatures even if the application tried', async () => {
      const { owner, lead } = await toSent();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      const version = await prisma.torVersion.findFirstOrThrow({
        where: { tor: { leadId: lead.id } },
      });
      await expect(
        prisma.clientAccount.create({
          data: {
            number: `CL-X-${Date.now()}`,
            leadId: lead.id,
            torId: version.torId,
            signedTorVersionId: version.id,
            name: 'Forged',
            convertedByUserId: owner.user.id,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
