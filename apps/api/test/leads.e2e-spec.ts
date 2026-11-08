import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LeadRevisitProcessor } from '../src/modules/leads/application/lead-revisit-processor.js';
import { bearer, createApp, createUser, loginToken, loginVerifiedToken } from './helpers.js';

describe('leads (e2e)', () => {
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

  // Each lead gets its own phone so these tests never trip duplicate detection
  // (covered in leads-capture.e2e-spec.ts).
  let sequence = 0;
  const body = (suffix: string) => ({
    name: `Lead ${suffix}`,
    phone: `+25470${String(1_000_000 + sequence++)}`,
    email: `lead-${suffix}@example.test`,
    source: 'WEBSITE',
    currency: 'KES',
    estimatedValue: '120000.50',
    nextAction: 'Schedule discovery call',
    nextActionAt: '2026-11-10T08:00:00.000Z',
    probability: 25,
  });

  it('persists, searches, reads, updates and audits a BD-owned lead', async () => {
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const token = await loginToken(app, bd.email);
    const created = await http().post('/api/v1/leads').set(bearer(token)).send(body('own'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Lead own',
      stage: 'NEW_LEAD',
      ownerUserId: bd.id,
      estimatedValue: '120000.50',
    });
    const listed = await http().get('/api/v1/leads?q=Lead%20own').set(bearer(token));
    expect(listed.body).toMatchObject({ total: 1, items: [{ id: created.body.id }] });
    const updated = await http()
      .patch(`/api/v1/leads/${created.body.id}`)
      .set(bearer(token))
      .send({ nextAction: 'Send product overview', probability: 35 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ nextAction: 'Send product overview', probability: 35 });
    expect(
      await prisma.auditLog.count({ where: { entityType: 'lead', entityId: created.body.id } }),
    ).toBe(2);
  });

  it('scopes Business Development to owned records while Director can view all', async () => {
    const owner = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const other = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const ownerToken = await loginToken(app, owner.email);
    const otherToken = await loginToken(app, other.email);
    const director = await createUser(app, { roles: [SystemRoleKey.Director] });
    const directorToken = await loginVerifiedToken(app, director.email);
    const created = await http().post('/api/v1/leads').set(bearer(ownerToken)).send(body('scope'));
    expect(created.status).toBe(201);
    expect((await http().get('/api/v1/leads').set(bearer(otherToken))).body.total).toBe(0);
    expect(
      (await http().get(`/api/v1/leads/${created.body.id}`).set(bearer(otherToken))).status,
    ).toBe(404);
    expect((await http().get('/api/v1/leads').set(bearer(directorToken))).body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
    );
    const tamper = await http()
      .patch(`/api/v1/leads/${created.body.id}`)
      .set(bearer(ownerToken))
      .send({ stage: 'WON', ownerUserId: other.id });
    expect(tamper.status).toBe(400);
  });

  it('refuses ambiguous access to Technical Lead and Finance and requires referral attribution', async () => {
    for (const role of [SystemRoleKey.TechnicalLead, SystemRoleKey.Finance]) {
      const user = await createUser(app, { roles: [role] });
      const token = await loginToken(app, user.email);
      expect((await http().get('/api/v1/leads').set(bearer(token))).status).toBe(403);
    }
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const token = await loginToken(app, bd.email);
    const invalid = await http()
      .post('/api/v1/leads')
      .set(bearer(token))
      .send({ ...body('referral'), source: 'REFERRAL' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
  });

  it('moves forward with compare-and-set, records history/audit, and blocks direct stage patches', async () => {
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const token = await loginToken(app, bd.email);
    const created = await http().post('/api/v1/leads').set(bearer(token)).send(body('lifecycle'));
    const id = created.body.id as string;

    const invalidPatch = await http()
      .patch(`/api/v1/leads/${id}`)
      .set(bearer(token))
      .send({ stage: 'WON' });
    expect(invalidPatch.status).toBe(400);

    const moved = await http()
      .post(`/api/v1/leads/${id}/transitions`)
      .set(bearer(token))
      .send({ fromStage: 'NEW_LEAD', toStage: 'VISITS_AND_CALLS' });
    expect(moved.status).toBe(200);
    expect(moved.body.stage).toBe('VISITS_AND_CALLS');

    const [history, audit] = await Promise.all([
      prisma.leadStageHistory.findMany({ where: { leadId: id } }),
      prisma.auditLog.findMany({ where: { entityType: 'lead', entityId: id } }),
    ]);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStage: 'NEW_LEAD',
      toStage: 'VISITS_AND_CALLS',
      actorUserId: bd.id,
      source: 'MANUAL',
    });
    expect(audit.map((row) => row.action)).toContain('lead.stage_changed');
  });

  it('rejects an invalid transition and conflicting concurrent transition without duplicate history', async () => {
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const token = await loginToken(app, bd.email);
    const created = await http().post('/api/v1/leads').set(bearer(token)).send(body('race'));
    const id = created.body.id as string;

    const invalid = await http()
      .post(`/api/v1/leads/${id}/transitions`)
      .set(bearer(token))
      .send({ fromStage: 'NEW_LEAD', toStage: 'SCOPE_ALIGNMENT' });
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('INVALID_STAGE_TRANSITION');

    const requests = await Promise.all([
      http().post(`/api/v1/leads/${id}/transitions`).set(bearer(token)).send({
        fromStage: 'NEW_LEAD',
        toStage: 'VISITS_AND_CALLS',
      }),
      http().post(`/api/v1/leads/${id}/transitions`).set(bearer(token)).send({
        fromStage: 'NEW_LEAD',
        toStage: 'VISITS_AND_CALLS',
      }),
    ]);
    expect(requests.map((response) => response.status).sort((left, right) => left - right)).toEqual(
      [200, 409],
    );
    expect(await prisma.leadStageHistory.count({ where: { leadId: id } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'lead', entityId: id, action: 'lead.stage_changed' },
      }),
    ).toBe(1);
  });

  it('requires a revisit date only for timing disqualification and automatically re-enters once due', async () => {
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const token = await loginToken(app, bd.email);
    const created = await http().post('/api/v1/leads').set(bearer(token)).send(body('revisit'));
    const id = created.body.id as string;
    await http()
      .post(`/api/v1/leads/${id}/transitions`)
      .set(bearer(token))
      .send({ fromStage: 'NEW_LEAD', toStage: 'VISITS_AND_CALLS' })
      .expect(200);

    const missingDate = await http()
      .post(`/api/v1/leads/${id}/disqualification`)
      .set(bearer(token))
      .send({ fromStage: 'VISITS_AND_CALLS', reason: 'TIMING_REVISIT_LATER' });
    expect(missingDate.status).toBe(409);
    expect(missingDate.body.code).toBe('REVISIT_DATE_REQUIRED');

    const disqualified = await http()
      .post(`/api/v1/leads/${id}/disqualification`)
      .set(bearer(token))
      .send({
        fromStage: 'VISITS_AND_CALLS',
        reason: 'TIMING_REVISIT_LATER',
        revisitOn: '2026-11-11',
      });
    expect(disqualified.status).toBe(200);
    expect(disqualified.body).toMatchObject({
      stage: 'DISQUALIFIED',
      disqualificationReason: 'TIMING_REVISIT_LATER',
      revisitOn: '2026-11-11',
    });

    const processor = app.get(LeadRevisitProcessor);
    const early = await processor.processDue(new Date('2026-11-10T20:59:59.000Z'));
    expect(early.reentered).toBe(0);
    const due = await processor.processDue(new Date('2026-11-10T21:00:00.000Z'));
    expect(due).toMatchObject({ businessDate: '2026-11-11', reentered: 1, failed: 0 });
    const retry = await processor.processDue(new Date('2026-11-15T12:00:00.000Z'));
    expect(retry.reentered).toBe(0);

    const final = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(final).toMatchObject({
      stage: 'NEW_LEAD',
      disqualificationReason: 'TIMING_REVISIT_LATER',
      revisitOn: new Date('2026-11-11T00:00:00.000Z'),
    });
    expect(
      await prisma.leadStageHistory.count({
        where: { leadId: id, source: 'SCHEDULED_REVISIT', toStage: 'NEW_LEAD' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'lead', entityId: id, action: 'lead.revisit_reentered' },
      }),
    ).toBe(1);
  });

  it('retains a Lost reason across unrelated edits and hides the record from another BD owner', async () => {
    const owner = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const other = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const ownerToken = await loginToken(app, owner.email);
    const otherToken = await loginToken(app, other.email);
    const created = await http().post('/api/v1/leads').set(bearer(ownerToken)).send(body('lost'));
    const id = created.body.id as string;

    const invisible = await http()
      .post(`/api/v1/leads/${id}/transitions`)
      .set(bearer(otherToken))
      .send({ fromStage: 'NEW_LEAD', toStage: 'VISITS_AND_CALLS' });
    expect(invisible.status).toBe(404);

    const move = async (fromStage: string, toStage: string, reason?: string) =>
      http()
        .post(`/api/v1/leads/${id}/transitions`)
        .set(bearer(ownerToken))
        .send({ fromStage, toStage, ...(reason ? { reason } : {}) });
    expect((await move('NEW_LEAD', 'VISITS_AND_CALLS')).status).toBe(200);
    expect((await move('VISITS_AND_CALLS', 'QUALIFIED', 'BANT review recorded')).status).toBe(200);
    expect((await move('QUALIFIED', 'SCOPE_ALIGNMENT')).status).toBe(200);
    expect((await move('SCOPE_ALIGNMENT', 'TOR_QUOTE_SENT')).status).toBe(200);

    const missingReason = await http()
      .post(`/api/v1/leads/${id}/lost`)
      .set(bearer(ownerToken))
      .send({ fromStage: 'TOR_QUOTE_SENT', reason: ' ' });
    expect(missingReason.status).toBe(400);

    const lost = await http()
      .post(`/api/v1/leads/${id}/lost`)
      .set(bearer(ownerToken))
      .send({ fromStage: 'TOR_QUOTE_SENT', reason: 'Client selected another provider' });
    expect(lost.status).toBe(200);
    await http()
      .patch(`/api/v1/leads/${id}`)
      .set(bearer(ownerToken))
      .send({ notes: 'Follow-up note' })
      .expect(200);
    const reloaded = await http().get(`/api/v1/leads/${id}`).set(bearer(ownerToken));
    expect(reloaded.body).toMatchObject({
      stage: 'LOST',
      lostReason: 'Client selected another provider',
    });
    expect(await prisma.leadStageHistory.count({ where: { leadId: id, toStage: 'LOST' } })).toBe(1);
  });
});
