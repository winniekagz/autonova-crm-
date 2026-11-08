import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RetentionUseCases } from '../src/modules/activities/application/retention.use-cases.js';
import type { RetentionApprovalBody } from '../src/modules/activities/presentation/activities.schemas.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FILE_STORAGE, type FileStorage } from '../src/modules/storage/file-storage.js';
import { attachmentsKit } from './attachments-kit.js';
import { bearer, createApp } from './helpers.js';
import { JPEG, MP3, PDF } from './upload-fixtures.js';

const MB = 1024 * 1024;
const FAR_FUTURE = new Date('2040-01-01T00:00:00Z');

describe('visit report governance (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let retention: RetentionUseCases;
  let storage: FileStorage;
  const {
    http,
    user,
    makeCompany,
    makeContact,
    makeLead,
    filesOnDisk,
    setup,
    upload,
    uploadVoice,
  } = attachmentsKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    retention = app.get(RetentionUseCases);
    storage = app.get<FileStorage>(FILE_STORAGE);
  });
  afterAll(async () => {
    await app.close();
  });

  const director = () => user(SystemRoleKey.Director);

  describe('voice notes and recording notice', () => {
    it('needs the participants’ notice confirmed, and records it', async () => {
      const { owner, url } = await setup();
      const before = await filesOnDisk();
      const missing = await upload(url, owner.token, 'VOICE_NOTE', MP3, 'n.mp3');
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('VALIDATION_FAILED');
      const denied = await upload(url, owner.token, 'VOICE_NOTE', MP3, 'n.mp3', 'false');
      expect(denied.status).toBe(400);
      expect(denied.body.code).toBe('RECORDING_NOTICE_REQUIRED');
      expect(await filesOnDisk()).toEqual(before);
      const ok = await uploadVoice(url, owner.token, MP3, 'n.mp3');
      expect(ok.status).toBe(201);
      expect(ok.body.recordingNoticeGiven).toBe(true);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'attachment.uploaded',
          newValues: { path: ['attachmentId'], equals: ok.body.id },
        },
      });
      expect(audit.newValues).toMatchObject({ recordingNoticeGiven: true });
    });

    it('refuses the notice field on photos and documents', async () => {
      const { owner, url } = await setup();
      const res = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg', 'true');
      expect(res.status).toBe(400);
    });
  });

  describe('total size per report', () => {
    it('stops at 50 MB in total, counts only active files, and frees room when a Director removes one', async () => {
      const { owner, lead, activity, url } = await setup();
      const voice = Buffer.concat([MP3, Buffer.alloc(19 * MB)]);
      const first = await uploadVoice(url, owner.token, voice, 'a.mp3');
      const second = await uploadVoice(url, owner.token, voice, 'b.mp3');
      expect([first.status, second.status]).toEqual([201, 201]);
      const doc = Buffer.concat([PDF, Buffer.alloc(24 * MB)]);
      const before = await filesOnDisk();
      const over = await upload(url, owner.token, 'DOCUMENT', doc, 'c.pdf');
      expect(over.status).toBe(413);
      expect(over.body.code).toBe('ATTACHMENT_TOTAL_EXCEEDED');
      expect(await filesOnDisk()).toEqual(before);
      const detail = (
        await http()
          .get(`/api/v1/leads/${lead.id}/activities/${activity.id}`)
          .set(bearer(owner.token))
      ).body;
      expect(detail.attachmentBytes).toBe(voice.length * 2);
      const dir = await director();
      await http()
        .delete(`${url}/${first.body.id}`)
        .set(bearer(dir.token))
        .send({ reason: 'Recorded by mistake' })
        .expect(204);
      expect((await upload(url, owner.token, 'DOCUMENT', doc, 'c.pdf')).status).toBe(201);
    });
  });

  describe('linking an outside attendee', () => {
    const report = (attendees: unknown[]) => ({
      type: 'VISIT',
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      discussion: 'met',
      attendees,
    });

    it('links to a contact of the lead’s company, keeps the recorded name, never creates a contact, and audits it', async () => {
      const { token, user: bd } = await user();
      const company = await makeCompany(token);
      const contact = await makeContact(token, company.id, { name: 'Achieng Otieno' });
      const lead = await makeLead(token, { companyId: company.id });
      const base = `/api/v1/leads/${lead.id}/activities`;
      const created = await http()
        .post(base)
        .set(bearer(token))
        .send(report([{ name: 'A. Otieno', organisation: 'Acme' }]));
      const attendee = created.body.attendees[0];
      const contactsBefore = await prisma.contact.count();
      const res = await http()
        .post(`${base}/${created.body.id}/attendees/${attendee.id}/link`)
        .set(bearer(token))
        .send({ contactId: contact.id });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.attendees[0]).toMatchObject({
        id: attendee.id,
        contactId: contact.id,
        recordedAs: 'A. Otieno',
      });
      expect(res.body.attendees[0].linkedAt).toBeTruthy();
      expect(await prisma.contact.count()).toBe(contactsBefore);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: created.body.id, action: 'activity.attendee_linked' },
      });
      expect(audit).toMatchObject({ actorUserId: bd.id });
      expect(audit.newValues).toEqual({ attendeeId: attendee.id, contactId: contact.id });
      const again = await http()
        .post(`${base}/${created.body.id}/attendees/${attendee.id}/link`)
        .set(bearer(token))
        .send({ contactId: contact.id });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ATTENDEE_NOT_EXTERNAL');
    });

    it('refuses another company’s contact, a contact already attending, a stranger and a non-creator', async () => {
      const { token } = await user();
      const company = await makeCompany(token);
      const mine = await makeContact(token, company.id);
      const foreign = await makeContact(token, (await makeCompany(token)).id);
      const lead = await makeLead(token, { companyId: company.id });
      const base = `/api/v1/leads/${lead.id}/activities`;
      const created = await http()
        .post(base)
        .set(bearer(token))
        .send(report([{ contactId: mine.id }, { name: 'Guest' }]));
      const guest = created.body.attendees.find((a: { kind: string }) => a.kind === 'EXTERNAL');
      const link = (t: string, contactId: string) =>
        http()
          .post(`${base}/${created.body.id}/attendees/${guest.id}/link`)
          .set(bearer(t))
          .send({ contactId });
      expect((await link(token, foreign.id)).status).toBe(409);
      expect((await link(token, mine.id)).status).toBe(400);
      expect((await link((await user()).token, mine.id)).status).toBe(404);
      const dir = await director();
      expect((await link(dir.token, foreign.id)).body.code).toBe('ACTIVITY_ATTENDEE_UNAVAILABLE');
      const row = await prisma.activityAttendee.findUniqueOrThrow({ where: { id: guest.id } });
      expect(row.contactId).toBeNull();
    });
  });

  describe('legal holds', () => {
    it('are Director only, need a reference and reason, and are audited when placed and lifted', async () => {
      const { owner, base } = await setup();
      const dir = await director();
      const body = { reference: 'MATTER-2026-14', reason: 'Client dispute' };
      expect((await http().post(`${base}/hold`).set(bearer(owner.token)).send(body)).status).toBe(
        403,
      );
      for (const bad of [{}, { reference: 'x' }, { reason: 'x' }, { ...body, extra: 1 }]) {
        expect((await http().post(`${base}/hold`).set(bearer(dir.token)).send(bad)).status).toBe(
          400,
        );
      }
      const held = await http().post(`${base}/hold`).set(bearer(dir.token)).send(body);
      expect(held.status, JSON.stringify(held.body)).toBe(200);
      expect(held.body.hold).toMatchObject({
        reference: 'MATTER-2026-14',
        reason: 'Client dispute',
      });
      expect((await http().post(`${base}/hold`).set(bearer(dir.token)).send(body)).body.code).toBe(
        'ACTIVITY_HOLD_EXISTS',
      );
      expect(
        (await http().delete(`${base}/hold`).set(bearer(owner.token)).send({ reason: 'x' })).status,
      ).toBe(403);
      const lifted = await http()
        .delete(`${base}/hold`)
        .set(bearer(dir.token))
        .send({ reason: 'Matter closed' });
      expect(lifted.body.hold).toBeNull();
      expect(
        (await http().delete(`${base}/hold`).set(bearer(dir.token)).send({ reason: 'again' })).body
          .code,
      ).toBe('ACTIVITY_NOT_HELD');
      const actions = await prisma.auditLog.findMany({
        where: { entityId: held.body.id, action: { startsWith: 'activity.hold' } },
        orderBy: { occurredAt: 'asc' },
      });
      expect(actions.map((a) => [a.action, a.reason])).toEqual([
        ['activity.hold_placed', 'Client dispute'],
        ['activity.hold_lifted', 'Matter closed'],
      ]);
    });
  });

  describe('retention', () => {
    const gpsVisit = async () => {
      const ctx = await setup();
      await http()
        .patch(ctx.base)
        .set(bearer(ctx.owner.token))
        .send({ gps: { latitude: -1.286389, longitude: 36.817223 } })
        .expect(200);
      return ctx;
    };
    const approval = (items: RetentionApprovalBody['items']) => ({
      items,
      reference: 'POLICY-12M',
      reason: 'Twelve month review',
    });

    it('lists what is due without changing anything, and flags held reports', async () => {
      const a = await gpsVisit();
      const b = await gpsVisit();
      const holder = await director();
      await http()
        .post(`/api/v1/leads/${b.lead.id}/activities/${b.activity.id}/hold`)
        .set(bearer(holder.token))
        .send({ reference: 'HOLD-1', reason: 'Dispute' })
        .expect(200);
      const now = new Date();
      expect(
        (await retention.review(now)).candidates.filter((c) => c.activityId === a.activity.id),
      ).toEqual([]);
      const review = await retention.review(FAR_FUTURE);
      const mine = review.candidates.filter((c) =>
        [a.activity.id, b.activity.id].includes(c.activityId),
      );
      const state = (id: string) => mine.find((c) => c.activityId === id);
      expect(mine).toHaveLength(2);
      expect(state(a.activity.id)).toMatchObject({ kind: 'GPS', held: false });
      expect(state(b.activity.id)).toMatchObject({ kind: 'GPS', held: true });
      expect(review).toMatchObject({ gpsMonths: 12, voiceNoteMonths: 12 });
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: a.activity.id } })).latitude,
      ).not.toBeNull();
    });

    it('clears a GPS check-in only for an approved item past its period, and audits it without coordinates', async () => {
      const { lead, activity, owner } = await gpsVisit();
      const dir = (await director()).user;
      const items: RetentionApprovalBody['items'] = [{ kind: 'GPS', activityId: activity.id }];
      const tooSoon = await retention.purge(approval(items), dir, undefined, new Date());
      expect(tooSoon).toEqual({ purged: 0, skippedHeld: 0, skippedNotDue: 1, failed: 0 });
      const done = await retention.purge(approval(items), dir, undefined, FAR_FUTURE);
      expect(done.purged).toBe(1);
      const row = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
      expect(row).toMatchObject({ latitude: null, longitude: null, gpsRecordedAt: null });
      expect(row.gpsClearedAt).not.toBeNull();
      const detail = await http()
        .get(`/api/v1/leads/${lead.id}/activities/${activity.id}`)
        .set(bearer(owner.token));
      expect(detail.body).toMatchObject({ gps: null, gpsCleared: true });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: activity.id, action: 'activity.gps_cleared' },
      });
      expect(audit).toMatchObject({ actorUserId: dir.id, reason: 'Twelve month review' });
      expect(JSON.stringify(audit)).not.toContain('36.8');
      expect(
        (await retention.purge(approval(items), dir, undefined, FAR_FUTURE)).skippedNotDue,
      ).toBe(1);
    });

    it('purges a voice note’s file but keeps its row, size and hash, audits it, and then refuses to serve it', async () => {
      const { owner, lead, activity, url } = await setup();
      const up = await uploadVoice(url, owner.token, MP3, 'n.mp3');
      const stored = await prisma.activityAttachment.findUniqueOrThrow({
        where: { id: up.body.id },
      });
      const dir = (await director()).user;
      const done = await retention.purge(
        approval([{ kind: 'VOICE_NOTE', activityId: activity.id, attachmentId: up.body.id }]),
        dir,
        'req-1',
        FAR_FUTURE,
      );
      expect(done.purged).toBe(1);
      expect(await filesOnDisk()).not.toContain(stored.storageKey);
      await expect(storage.open(stored.storageKey)).rejects.toThrow();
      const row = await prisma.activityAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
      expect(row).toMatchObject({
        sizeBytes: MP3.length,
        sha256: stored.sha256,
        purgedByUserId: dir.id,
        purgeReference: 'POLICY-12M',
        purgeReason: 'Twelve month review',
        archivedByUserId: dir.id,
      });
      expect(row.purgedAt).not.toBeNull();
      expect(row.archivedAt).not.toBeNull();
      expect((await http().get(`${url}/${up.body.id}`).set(bearer(owner.token))).status).toBe(404);
      expect((await http().get(url).set(bearer(owner.token))).body).toEqual([]);
      const detail = await http()
        .get(`/api/v1/leads/${lead.id}/activities/${activity.id}`)
        .set(bearer(owner.token));
      expect(detail.body.attachmentBytes).toBe(0);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: activity.id, action: 'attachment.purged' },
      });
      expect(audit).toMatchObject({ actorUserId: dir.id, requestId: 'req-1' });
      expect(JSON.stringify(audit)).not.toContain('n.mp3');
    });

    it('never touches a held report, and never a photo or document', async () => {
      const { owner, activity, url, lead } = await setup();
      const voice = await uploadVoice(url, owner.token, MP3, 'n.mp3');
      const photo = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      const dir = await director();
      await http()
        .post(`/api/v1/leads/${lead.id}/activities/${activity.id}/hold`)
        .set(bearer(dir.token))
        .send({ reference: 'HOLD-9', reason: 'Dispute' })
        .expect(200);
      const held = await retention.purge(
        approval([{ kind: 'VOICE_NOTE', activityId: activity.id, attachmentId: voice.body.id }]),
        dir.user,
        undefined,
        FAR_FUTURE,
      );
      expect(held).toEqual({ purged: 0, skippedHeld: 1, skippedNotDue: 0, failed: 0 });
      const wrongKind = await retention.purge(
        approval([{ kind: 'VOICE_NOTE', activityId: activity.id, attachmentId: photo.body.id }]),
        dir.user,
        undefined,
        FAR_FUTURE,
      );
      expect(wrongKind.purged).toBe(0);
      const rows = await prisma.activityAttachment.findMany({ where: { activityId: activity.id } });
      expect(rows.every((r) => r.purgedAt === null)).toBe(true);
    });

    it('only approves an explicit, valid list, and has no HTTP route that deletes in bulk', async () => {
      const { retentionApprovalSchema } =
        await import('../src/modules/activities/presentation/activities.schemas.js');
      const id = '0192f1a0-0000-7000-8000-00000000dead';
      expect(retentionApprovalSchema.safeParse(approval([])).success).toBe(false);
      expect(
        retentionApprovalSchema.safeParse(approval([{ kind: 'VOICE_NOTE', activityId: id }]))
          .success,
      ).toBe(false);
      expect(
        retentionApprovalSchema.safeParse(
          approval([{ kind: 'GPS', activityId: id, attachmentId: id }]),
        ).success,
      ).toBe(false);
      expect(
        retentionApprovalSchema.safeParse(approval([{ kind: 'GPS', activityId: id }])).success,
      ).toBe(true);
      const dir = await director();
      for (const path of ['/api/v1/retention', '/api/v1/activities/retention']) {
        expect((await http().post(path).set(bearer(dir.token)).send({})).status).toBe(404);
      }
    });
  });
});
