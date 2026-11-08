import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('visit and call reports (e2e)', () => {
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

  describe('recording and reading', () => {
    it('records every structured field, keeps occurrence apart from creation, and audits it', async () => {
      const { token, user: bd } = await user();
      const lead = await makeLead(token);
      const occurredAt = past(60 * 24 * 3);
      const res = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send({
          type: 'VISIT',
          occurredAt,
          location: 'Westlands, Nairobi',
          gps: { latitude: -1.28638912, longitude: 36.81722345 },
          discussion: 'Walked the shop floor with the owner.',
          painPoints: 'Stock counts are done on paper.',
          currentTools: 'Excel and a notebook',
          nextSteps: 'Send a POS quote by Friday.',
          attendees: [{ name: '  Jane   Doe ', organisation: 'Acme Hardware' }],
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({
        leadId: lead.id,
        type: 'VISIT',
        occurredAt,
        location: 'Westlands, Nairobi',
        gps: { latitude: -1.286389, longitude: 36.817223 },
        painPoints: 'Stock counts are done on paper.',
        currentTools: 'Excel and a notebook',
        nextSteps: 'Send a POS quote by Friday.',
        attachmentCount: 0,
        archived: false,
        attendees: [{ kind: 'EXTERNAL', name: 'Jane   Doe', organisation: 'Acme Hardware' }],
      });
      expect(new Date(res.body.createdAt).getTime()).toBeGreaterThan(
        new Date(res.body.occurredAt).getTime() + 2 * 24 * 3600_000,
      );
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: res.body.id, action: 'activity.created' },
      });
      expect(audit?.actorUserId).toBe(bd.id);
      expect(JSON.stringify(audit?.newValues)).not.toContain('paper');
      expect(JSON.stringify(audit?.newValues)).not.toContain('36.81');
      expect(audit?.newValues).toMatchObject({ leadId: lead.id, hasGps: true, attendeeCount: 1 });
    });

    it('needs only a type, a date and a discussion, and rejects bad input per field', async () => {
      const { token } = await user();
      const lead = await makeLead(token);
      const ok = await http().post(base(lead.id)).set(bearer(token)).send(report());
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ location: null, gps: null, painPoints: null, attendees: [] });
      const bad = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send({
          type: 'LUNCH',
          occurredAt: 'yesterday',
          discussion: '   ',
          attendees: [{ name: '' }],
        });
      expect(bad.status).toBe(400);
      expect(bad.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['type', 'occurredAt', 'discussion']),
      );
      for (const extra of [
        { leadId: 'x' },
        { createdByUserId: 'x' },
        { archivedAt: 'now' },
        { stage: 'WON' },
      ]) {
        expect(
          (await http().post(base(lead.id)).set(bearer(token)).send(report(extra))).status,
        ).toBe(400);
      }
    });

    it('refuses the future but accepts an old date, and refuses GPS on anything but a visit', async () => {
      const { token } = await user();
      const lead = await makeLead(token);
      const future = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send(report({ occurredAt: new Date(Date.now() + 3_600_000).toISOString() }));
      expect(future.status).toBe(400);
      expect(future.body.details).toEqual([
        { path: 'occurredAt', message: 'The date and time cannot be in the future.' },
      ]);
      expect(
        (
          await http()
            .post(base(lead.id))
            .set(bearer(token))
            .send(report({ occurredAt: '2025-01-15T08:00:00.000Z' }))
        ).status,
      ).toBe(201);
      const gps = { latitude: -1.2, longitude: 36.8 };
      const call = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send(report({ type: 'CALL', gps }));
      expect(call.status).toBe(400);
      expect(call.body.details[0].path).toBe('gps');
      expect(
        (
          await http()
            .post(base(lead.id))
            .set(bearer(token))
            .send(report({ type: 'VISIT', gps }))
        ).status,
      ).toBe(201);
      expect(
        (
          await http()
            .post(base(lead.id))
            .set(bearer(token))
            .send(report({ type: 'VISIT', gps: { latitude: 95, longitude: 0 } }))
        ).status,
      ).toBe(400);
      expect(
        (
          await http()
            .post(base(lead.id))
            .set(bearer(token))
            .send(report({ type: 'VISIT', gps: { latitude: 1 } }))
        ).status,
      ).toBe(400);
    });

    it('never changes the lead or earlier reports, and lists newest interaction first with pagination', async () => {
      const { token } = await user();
      const lead = await makeLead(token);
      const before = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(token));
      const oldest = await record(token, lead.id, { occurredAt: past(3000), discussion: 'first' });
      const newest = await record(token, lead.id, { occurredAt: past(10), discussion: 'third' });
      await record(token, lead.id, { occurredAt: past(2000), discussion: 'second' });
      const after = await http().get(`/api/v1/leads/${lead.id}`).set(bearer(token));
      expect(after.body.stage).toBe(before.body.stage);
      expect(after.body.updatedAt).toBe(before.body.updatedAt);
      const page1 = await http()
        .get(`${base(lead.id)}?pageSize=2`)
        .set(bearer(token));
      expect(page1.body.total).toBe(3);
      expect(page1.body.items.map((a: { discussion: string }) => a.discussion)).toEqual([
        'third',
        'second',
      ]);
      const page2 = await http()
        .get(`${base(lead.id)}?pageSize=2&page=2`)
        .set(bearer(token));
      expect(page2.body.items.map((a: { id: string }) => a.id)).toEqual([oldest.id]);
      expect(newest.id).toBeTruthy();
      const calls = await http()
        .get(`${base(lead.id)}?type=CALL`)
        .set(bearer(token));
      expect(calls.body.total).toBe(0);
      expect(
        (
          await http()
            .get(`${base(lead.id)}?pageSize=101`)
            .set(bearer(token))
        ).status,
      ).toBe(400);
      expect(
        (
          await http()
            .get(`${base(lead.id)}?type=LUNCH`)
            .set(bearer(token))
        ).status,
      ).toBe(400);
    });
  });

  describe('attendees', () => {
    it('accepts contacts of the lead’s company alongside outside people', async () => {
      const { token } = await user();
      const company = await makeCompany(token);
      const contact = await makeContact(token, company.id, { name: 'Achieng', jobTitle: 'CEO' });
      const lead = await makeLead(token, { companyId: company.id });
      const res = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send(
          report({
            attendees: [{ contactId: contact.id }, { name: 'Consultant', organisation: 'Ext Ltd' }],
          }),
        );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.attendees).toEqual([
        expect.objectContaining({
          kind: 'CONTACT',
          contactId: contact.id,
          name: 'Achieng',
          jobTitle: 'CEO',
        }),
        expect.objectContaining({
          kind: 'EXTERNAL',
          contactId: null,
          name: 'Consultant',
          organisation: 'Ext Ltd',
        }),
      ]);
    });

    it('refuses a contact of another company, an unknown contact, and any contact on a lead without a company', async () => {
      const { token } = await user();
      const mine = await makeCompany(token);
      const other = await makeCompany(token);
      const foreign = await makeContact(token, other.id);
      const lead = await makeLead(token, { companyId: mine.id });
      const solo = await makeLead(token);
      for (const contactId of [foreign.id, '0192f1a0-0000-7000-8000-00000000dead']) {
        const res = await http()
          .post(base(lead.id))
          .set(bearer(token))
          .send(report({ attendees: [{ contactId }] }));
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ACTIVITY_ATTENDEE_UNAVAILABLE');
      }
      const none = await http()
        .post(base(solo.id))
        .set(bearer(token))
        .send(report({ attendees: [{ contactId: foreign.id }] }));
      expect(none.status).toBe(409);
      const dup = await http()
        .post(base(lead.id))
        .set(bearer(token))
        .send(report({ attendees: [{ name: 'Jo' }, { name: ' jo ' }] }));
      expect(dup.status).toBe(400);
      expect(await prisma.activity.count({ where: { leadId: { in: [lead.id, solo.id] } } })).toBe(
        0,
      );
    });

    it('stops a contact being archived while a report lists them is not required, but keeps the attendee row valid in the database', async () => {
      const { token, user: bd } = await user();
      const company = await makeCompany(token);
      const contact = await makeContact(token, company.id);
      const other = await makeCompany(token);
      const foreign = await makeContact(token, other.id);
      const lead = await makeLead(token, { companyId: company.id });
      const activity = await record(token, lead.id);
      await expect(
        prisma.activityAttendee.create({
          data: { activityId: activity.id, contactId: foreign.id },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.activityAttendee.create({
          data: { activityId: activity.id, contactId: contact.id, externalName: 'both' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.activityAttendee.create({ data: { activityId: activity.id } }),
      ).rejects.toThrow();
      expect(bd.id).toBeTruthy();
    });
  });

  describe('editing and archiving', () => {
    it('lets the creator edit, replaces attendees, and audits the change without copying free text', async () => {
      const { token, user: bd } = await user();
      const lead = await makeLead(token);
      const created = await record(token, lead.id, { attendees: [{ name: 'Old Attendee' }] });
      const res = await http()
        .patch(`${base(lead.id)}/${created.id}`)
        .set(bearer(token))
        .send({
          nextSteps: 'Call back Monday',
          painPoints: 'Slow tills',
          attendees: [{ name: 'New Attendee' }],
        });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ nextSteps: 'Call back Monday', painPoints: 'Slow tills' });
      expect(res.body.attendees.map((a: { name: string }) => a.name)).toEqual(['New Attendee']);
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body.createdAt).getTime(),
      );
      const audit = await prisma.auditLog.findMany({
        where: { entityId: created.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual(['activity.created', 'activity.updated']);
      expect(audit[1]?.actorUserId).toBe(bd.id);
      expect(audit[1]?.newValues).toEqual({
        changedFields: 'painPointsLength,nextStepsLength,attendeeCount',
        painPointsLength: 'Slow tills'.length,
        nextStepsLength: 'Call back Monday'.length,
        attendeeCount: 1,
      });
      expect(audit[1]?.oldValues).toEqual({
        painPointsLength: 0,
        nextStepsLength: 0,
        attendeeCount: 1,
      });
      expect(audit[1]?.occurredAt).toBeInstanceOf(Date);
      expect(JSON.stringify(audit)).not.toContain('Slow tills');
      expect(JSON.stringify(audit)).not.toContain('New Attendee');
    });

    it('does not record an edit that changes nothing as changed fields', async () => {
      const { token } = await user();
      const lead = await makeLead(token);
      const created = await record(token, lead.id, { location: 'Westlands' });
      await http()
        .patch(`${base(lead.id)}/${created.id}`)
        .set(bearer(token))
        .send({ location: 'Westlands' })
        .expect(200);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: created.id, action: 'activity.updated' },
      });
      expect(audit.newValues).toEqual({ changedFields: '' });
    });

    it('lets a Director edit any report, but not another BD user, even on a lead they can see', async () => {
      const owner = await user();
      const director = await user(SystemRoleKey.Director);
      const lead = await makeLead(owner.token);
      const created = await record(owner.token, lead.id);
      const byDirector = await http()
        .patch(`${base(lead.id)}/${created.id}`)
        .set(bearer(director.token))
        .send({ location: 'Edited by Director' });
      expect(byDirector.status).toBe(200);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: created.id, action: 'activity.updated' },
      });
      expect(audit.actorUserId).toBe(director.user.id);
      expect(audit.newValues).toMatchObject({
        changedFields: 'location',
        location: 'Edited by Director',
      });

      const dirLead = await makeLead(director.token);
      const dirReport = await record(director.token, dirLead.id);
      const stranger = await user();
      const noLead = await http()
        .patch(`${base(dirLead.id)}/${dirReport.id}`)
        .set(bearer(stranger.token))
        .send({ location: 'x' });
      expect(noLead.status).toBe(404);

      // a second salesperson who can see the lead (it is theirs) but did not record this report
      const ownerLead = await makeLead(owner.token);
      const byDir = await record(director.token, ownerLead.id);
      const notYours = await http()
        .patch(`${base(ownerLead.id)}/${byDir.id}`)
        .set(bearer(owner.token))
        .send({ location: 'mine now' });
      expect(notYours.status).toBe(403);
      expect(notYours.body.code).toBe('ACTIVITY_NOT_YOURS');
      const intact = await http()
        .get(`${base(ownerLead.id)}/${byDir.id}`)
        .set(bearer(owner.token));
      expect(intact.body.location).toBeNull();
      expect(intact.body.archived).toBe(false);
    });

    it('lets only a Director archive and restore, with a reason, hides archived reports, and keeps them out of edits', async () => {
      const { token } = await user();
      const director = await user(SystemRoleKey.Director);
      const lead = await makeLead(token);
      const created = await record(token, lead.id);
      const kept = await record(token, lead.id);
      const archiveUrl = `${base(lead.id)}/${created.id}/archive`;
      const byRecorder = await http().post(archiveUrl).set(bearer(token)).send({ reason: 'mine' });
      expect(byRecorder.status).toBe(403);
      expect(byRecorder.body.code).toBe('FORBIDDEN');
      for (const body of [
        {},
        { reason: '  ' },
        { reason: 'x'.repeat(501) },
        { reason: 'a', x: 1 },
      ]) {
        expect((await http().post(archiveUrl).set(bearer(director.token)).send(body)).status).toBe(
          400,
        );
      }
      const archived = await http()
        .post(archiveUrl)
        .set(bearer(director.token))
        .send({ reason: 'Logged on the wrong lead' });
      expect(archived.status, JSON.stringify(archived.body)).toBe(200);
      expect(archived.body).toMatchObject({
        archived: true,
        archivedReason: 'Logged on the wrong lead',
      });
      expect(
        (await http().get(base(lead.id)).set(bearer(token))).body.items.map(
          (a: { id: string }) => a.id,
        ),
      ).toEqual([kept.id]);
      expect(
        (
          await http()
            .get(`${base(lead.id)}?includeArchived=true`)
            .set(bearer(token))
        ).body.total,
      ).toBe(2);
      const edit = await http()
        .patch(`${base(lead.id)}/${created.id}`)
        .set(bearer(token))
        .send({ location: 'x' });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('ACTIVITY_ARCHIVED');
      expect(
        (await http().post(archiveUrl).set(bearer(director.token)).send({ reason: 'again' }))
          .status,
      ).toBe(409);
      const restoreUrl = `${base(lead.id)}/${created.id}/restore`;
      expect((await http().post(restoreUrl).set(bearer(token)).send({})).status).toBe(403);
      const restored = await http().post(restoreUrl).set(bearer(director.token)).send({});
      expect(restored.body).toMatchObject({ archived: false, archivedReason: null });
      const audit = await prisma.auditLog.findMany({
        where: { entityId: created.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'activity.created',
        'activity.archived',
        'activity.restored',
      ]);
      expect(audit[1]).toMatchObject({
        reason: 'Logged on the wrong lead',
        actorUserId: director.user.id,
      });
      await expect(prisma.activity.delete({ where: { id: created.id } })).rejects.toThrow();
    });
  });
});
