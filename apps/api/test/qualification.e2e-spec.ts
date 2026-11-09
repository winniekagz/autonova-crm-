import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp } from './helpers.js';
import { FULL, NONE, salesKit } from './sales-kit.js';

describe('BANT qualification (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, visitsLead, qualify, move } = salesKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  const director = () => user(SystemRoleKey.Director);

  it('calculates the score on the server and qualifies a passing lead', async () => {
    const { owner, lead } = await visitsLead();
    const ratings = {
      budget: 'FULLY_MET',
      authority: 'FULLY_MET',
      need: 'PARTIALLY_MET',
      timeline: 'NOT_MET',
    };
    const assessed = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(ratings);
    expect(assessed.status, JSON.stringify(assessed.body)).toBe(201);
    expect(assessed.body).toMatchObject({ score: 63, passMark: 60, passed: true });
    const res = await http()
      .post(`/api/v1/leads/${lead.id}/qualify`)
      .set(bearer(owner.token))
      .send({ fromStage: 'VISITS_AND_CALLS' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.stage).toBe('QUALIFIED');
    const history = await http().get(`/api/v1/leads/${lead.id}/history`).set(bearer(owner.token));
    expect(history.body.items[0]).toMatchObject({
      toStage: 'QUALIFIED',
      qualificationScore: 63,
      qualificationOverride: false,
    });
  });

  it('refuses a client-supplied score', async () => {
    const { owner, lead } = await visitsLead();
    const res = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send({ ...FULL, score: 100 });
    expect(res.status).toBe(400);
    expect(await prisma.leadQualification.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it('cannot qualify without an assessment, or around the BANT gate by the generic transition', async () => {
    const { owner, lead } = await visitsLead();
    const none = await http()
      .post(`/api/v1/leads/${lead.id}/qualify`)
      .set(bearer(owner.token))
      .send({ fromStage: 'VISITS_AND_CALLS' });
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('QUALIFICATION_NOT_ASSESSED');
    const bypass = await move(owner.token, lead.id, 'VISITS_AND_CALLS', 'QUALIFIED');
    expect(bypass.status).toBe(409);
    expect(bypass.body.code).toBe('USE_QUALIFY_ENDPOINT');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
      'VISITS_AND_CALLS',
    );
  });

  it('blocks a failing lead for a salesperson, even with a reason, and for a Director without one', async () => {
    const { owner, lead } = await visitsLead();
    const assessed = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(NONE);
    expect(assessed.body).toMatchObject({ score: 0, passed: false });
    const plain = await qualify(owner.token, lead.id, NONE);
    expect(plain.status).toBe(409);
    expect(plain.body.code).toBe('QUALIFICATION_NOT_PASSED');
    const withReason = await http()
      .post(`/api/v1/leads/${lead.id}/qualify`)
      .set(bearer(owner.token))
      .send({ fromStage: 'VISITS_AND_CALLS', overrideReason: 'Please let it through' });
    expect(withReason.status).toBe(403);
    expect(withReason.body.code).toBe('OVERRIDE_REQUIRES_DIRECTOR');
    const dir = await director();
    const noReason = await http()
      .post(`/api/v1/leads/${lead.id}/qualify`)
      .set(bearer(dir.token))
      .send({ fromStage: 'VISITS_AND_CALLS', overrideReason: '   ' });
    expect(noReason.status).toBe(409);
    expect(noReason.body.code).toBe('QUALIFICATION_NOT_PASSED');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe(
      'VISITS_AND_CALLS',
    );
  });

  it('lets a Director override a failing assessment with a reason, and records it', async () => {
    const { owner, lead } = await visitsLead();
    await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(NONE)
      .expect(201);
    const dir = await director();
    const res = await http().post(`/api/v1/leads/${lead.id}/qualify`).set(bearer(dir.token)).send({
      fromStage: 'VISITS_AND_CALLS',
      overrideReason: 'Strategic account, budget confirmed by phone',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.stage).toBe('QUALIFIED');
    const history = await prisma.leadStageHistory.findFirstOrThrow({
      where: { leadId: lead.id, toStage: 'QUALIFIED' },
    });
    expect(history).toMatchObject({ qualificationOverride: true, actorUserId: dir.user.id });
    expect(history.reason).toContain('Strategic account');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: lead.id, action: 'lead.qualified_override' },
    });
    expect(audit).toMatchObject({ actorUserId: dir.user.id });
    expect(audit.newValues).toMatchObject({
      score: 0,
      threshold: 60,
      result: 'NOT_MET',
      overridden: true,
    });
  });

  it('keeps assessments as an insert-only history and uses the newest', async () => {
    const { owner, lead } = await visitsLead();
    await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(NONE)
      .expect(201);
    await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(FULL)
      .expect(201);
    const current = await http()
      .get(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token));
    expect(current.body).toMatchObject({ score: 100, passed: true });
    const history = await http()
      .get(`/api/v1/leads/${lead.id}/qualification/history`)
      .set(bearer(owner.token));
    expect(history.body.items.map((i: { score: number }) => i.score)).toEqual([100, 0]);
    await expect(
      prisma.leadQualification.updateMany({ where: { leadId: lead.id }, data: { score: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.leadQualification.deleteMany({ where: { leadId: lead.id } }),
    ).rejects.toThrow();
  });

  it('only assesses leads in Visits and calls, and hides other people’s leads', async () => {
    const { owner, lead } = await visitsLead();
    const stranger = await user();
    expect(
      (
        await http()
          .post(`/api/v1/leads/${lead.id}/qualification`)
          .set(bearer(stranger.token))
          .send(FULL)
      ).status,
    ).toBe(404);
    expect(
      (await http().get(`/api/v1/leads/${lead.id}/qualification`).set(bearer(stranger.token)))
        .status,
    ).toBe(404);
    await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(FULL)
      .expect(201);
    await http()
      .post(`/api/v1/leads/${lead.id}/qualify`)
      .set(bearer(owner.token))
      .send({ fromStage: 'VISITS_AND_CALLS' })
      .expect(200);
    const again = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send(FULL);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('QUALIFICATION_WRONG_STAGE');
  });

  it('lets only a Director change the pass mark and weights, and scores past results with their own', async () => {
    const { owner, lead } = await visitsLead();
    const bdTry = await http()
      .put('/api/v1/settings/qualification')
      .set(bearer(owner.token))
      .send({ passMark: 10, weights: { budget: 25, authority: 25, need: 25, timeline: 25 } });
    expect(bdTry.status).toBe(403);
    const dir = await director();
    const bad = await http()
      .put('/api/v1/settings/qualification')
      .set(bearer(dir.token))
      .send({ passMark: 70, weights: { budget: 50, authority: 25, need: 25, timeline: 25 } });
    expect(bad.status).toBe(400);
    const before = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send({ ...FULL, timeline: 'NOT_MET' });
    expect(before.body).toMatchObject({ score: 75, passMark: 60 });
    const set = await http()
      .put('/api/v1/settings/qualification')
      .set(bearer(dir.token))
      .send({ passMark: 80, weights: { budget: 40, authority: 30, need: 20, timeline: 10 } });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toMatchObject({ passMark: 80, isDefault: false });
    const after = await http()
      .post(`/api/v1/leads/${lead.id}/qualification`)
      .set(bearer(owner.token))
      .send({ ...FULL, timeline: 'NOT_MET' });
    expect(after.body).toMatchObject({ score: 90, passMark: 80, passed: true });
    const old = await prisma.leadQualification.findUniqueOrThrow({ where: { id: before.body.id } });
    expect(old).toMatchObject({ score: 75, passMark: 60 });
    await http()
      .put('/api/v1/settings/qualification')
      .set(bearer(dir.token))
      .send({ passMark: 60, weights: { budget: 25, authority: 25, need: 25, timeline: 25 } })
      .expect(200);
  });
});
