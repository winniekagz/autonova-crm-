import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createApp } from './helpers.js';
import { salesKit } from './sales-kit.js';

describe('Terms of Reference: PDF, client accounts and access (e2e)', () => {
  let app: NestExpressApplication;
  const { http, user, qualifiedLead, torUrl, createTor, sign } = salesKit(() => app);
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });
  const director = () => user(SystemRoleKey.Director);

  const send = (token: string, leadId: string) =>
    http()
      .post(`${torUrl(leadId)}/send`)
      .set(bearer(token));

  describe('client accounts and PDF', () => {
    it('shows the account only to people who may see the lead, and has no create or edit route', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id).expect(201);
      await send(owner.token, lead.id).expect(200);
      const dir = await director();
      await sign(owner.token, lead.id, 1, 'CLIENT').expect(200);
      const done = await sign(dir.token, lead.id, 1, 'AUTONOVA');
      const id = done.body.clientAccount.id as string;
      expect((await http().get(`/api/v1/clients/${id}`).set(bearer(owner.token))).status).toBe(200);
      expect(
        (await http().get(`/api/v1/clients/by-lead/${lead.id}`).set(bearer(owner.token))).body.id,
      ).toBe(id);
      const stranger = await user();
      expect((await http().get(`/api/v1/clients/${id}`).set(bearer(stranger.token))).status).toBe(
        404,
      );
      const list = await http().get('/api/v1/clients').set(bearer(stranger.token));
      expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(id);
      expect((await http().post('/api/v1/clients').set(bearer(dir.token)).send({})).status).toBe(
        404,
      );
      expect(
        (await http().patch(`/api/v1/clients/${id}`).set(bearer(dir.token)).send({})).status,
      ).toBe(404);
    });

    it('produces a real PDF from the saved version for any status, and hides it from strangers', async () => {
      const { owner, lead } = await qualifiedLead();
      await createTor(owner.token, lead.id).expect(201);
      const pdf = await http()
        .get(`${torUrl(lead.id)}/versions/1/pdf`)
        .set(bearer(owner.token))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(
        /^attachment; filename="TOR-\d{4}-\d{4}-v1\.pdf"$/,
      );
      const bytes = pdf.body as Buffer;
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(1500);
      const stranger = await user();
      expect(
        (
          await http()
            .get(`${torUrl(lead.id)}/versions/1/pdf`)
            .set(bearer(stranger.token))
        ).status,
      ).toBe(404);
      expect(
        (
          await http()
            .get(`${torUrl(lead.id)}/versions/9/pdf`)
            .set(bearer(owner.token))
        ).status,
      ).toBe(404);
    });
  });

  it('refuses roles without ToR permissions', async () => {
    const { owner, lead } = await qualifiedLead();
    await createTor(owner.token, lead.id).expect(201);
    for (const role of [SystemRoleKey.Finance, SystemRoleKey.TechnicalLead]) {
      const { token } = await user(role);
      expect((await http().get(torUrl(lead.id)).set(bearer(token))).status).toBe(403);
      expect((await createTor(token, lead.id)).status).toBe(403);
      expect((await send(token, lead.id)).status).toBe(403);
    }
    expect((await http().get(torUrl(lead.id))).status).toBe(401);
  });
});
