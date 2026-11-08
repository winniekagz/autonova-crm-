import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('visit and call report authorization (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, tag, user, makeLead } = companyKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const past = (minutesAgo = 90) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const report = (over: Record<string, unknown> = {}) => ({
    type: 'MEETING',
    occurredAt: past(),
    discussion: `Discussed the rollout ${tag()}`,
    ...over,
  });
  const base = (leadId: string) => `/api/v1/leads/${leadId}/activities`;
  const record = async (token: string, leadId: string, over: Record<string, unknown> = {}) => {
    const res = await http().post(base(leadId)).set(bearer(token)).send(report(over));
    if (res.status !== 201)
      throw new Error(`activity create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string; occurredAt: string };
  };

  describe('authorization', () => {
    it('keeps a lead’s reports to people who may see that lead, and answers 404 for everything else alike', async () => {
      const owner = await user();
      const stranger = await user();
      const director = await user(SystemRoleKey.Director);
      const lead = await makeLead(owner.token);
      const created = await record(owner.token, lead.id);
      const missing = '0192f1a0-0000-7000-8000-00000000dead';
      for (const [method, path, body] of [
        ['get', base(lead.id), undefined],
        ['post', base(lead.id), report()],
        ['get', `${base(lead.id)}/${created.id}`, undefined],
        ['patch', `${base(lead.id)}/${created.id}`, { location: 'x' }],
        ['get', `${base(lead.id)}/${created.id}/attachments`, undefined],
      ] as const) {
        const hidden = await http()[method](path).set(bearer(stranger.token)).send(body);
        const absent = await http()
          [method](path.replace(lead.id, missing))
          .set(bearer(stranger.token))
          .send(body);
        expect(hidden.status, `${method} ${path}`).toBe(404);
        expect(absent.status).toBe(404);
        expect(hidden.body.code).toBe(absent.body.code);
      }
      expect(
        (
          await http()
            .get(`${base(lead.id)}/${created.id}`)
            .set(bearer(director.token))
        ).status,
      ).toBe(200);
      expect(await prisma.activity.count({ where: { leadId: lead.id } })).toBe(1);
    });

    it('never serves an activity through a different lead’s URL, even for someone who can see both', async () => {
      const { token } = await user();
      const a = await makeLead(token);
      const b = await makeLead(token);
      const inA = await record(token, a.id);
      const wrong = await http()
        .get(`${base(b.id)}/${inA.id}`)
        .set(bearer(token));
      expect(wrong.status).toBe(404);
      expect(wrong.body.code).toBe('ACTIVITY_NOT_FOUND');
      expect(
        (
          await http()
            .patch(`${base(b.id)}/${inA.id}`)
            .set(bearer(token))
            .send({ location: 'x' })
        ).status,
      ).toBe(404);
      await expect(
        prisma.activity.update({ where: { id: inA.id }, data: { leadId: b.id } }),
      ).rejects.toThrow();
    });

    it('denies roles without grants and unauthenticated callers', async () => {
      const owner = await user();
      const lead = await makeLead(owner.token);
      const created = await record(owner.token, lead.id);
      for (const role of [SystemRoleKey.Finance, SystemRoleKey.TechnicalLead]) {
        const { token } = await user(role);
        expect((await http().get(base(lead.id)).set(bearer(token))).status).toBe(403);
        expect((await http().post(base(lead.id)).set(bearer(token)).send(report())).status).toBe(
          403,
        );
        expect(
          (
            await http()
              .get(`${base(lead.id)}/${created.id}/attachments`)
              .set(bearer(token))
          ).status,
        ).toBe(403);
      }
      expect((await http().get(base(lead.id))).status).toBe(401);
      expect(
        (
          await http()
            .get(`${base('not-a-uuid')}`)
            .set(bearer(owner.token))
        ).status,
      ).toBe(400);
    });
  });
});
