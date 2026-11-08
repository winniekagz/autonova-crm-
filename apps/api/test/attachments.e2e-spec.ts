import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FILE_STORAGE, type FileStorage } from '../src/modules/storage/file-storage.js';
import { attachmentsKit } from './attachments-kit.js';
import { bearer, createApp } from './helpers.js';
import {
  CSV,
  DOCX,
  EXE,
  HTML,
  JPEG,
  M4A,
  MP3,
  PDF,
  PNG,
  SVG,
  WAV,
  XLSX,
} from './upload-fixtures.js';

describe('visit report attachments (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: FileStorage;
  const { http, user, makeLead, root, filesOnDisk, setup, upload, uploadVoice } = attachmentsKit(
    () => app,
  );
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    storage = app.get<FileStorage>(FILE_STORAGE);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('accepted uploads', () => {
    it.each([
      ['PHOTO', JPEG, 'site visit.jpg', 'image/jpeg'],
      ['PHOTO', PNG, 'shelf.png', 'image/png'],
      ['VOICE_NOTE', MP3, 'note.mp3', 'audio/mpeg'],
      ['VOICE_NOTE', M4A, 'note.m4a', 'audio/x-m4a'],
      ['VOICE_NOTE', WAV, 'note.wav', 'audio/wav'],
      ['DOCUMENT', PDF, 'price list.pdf', 'application/pdf'],
      [
        'DOCUMENT',
        DOCX,
        'client form.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [
        'DOCUMENT',
        XLSX,
        'prices.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      ['DOCUMENT', CSV, 'contacts.csv', 'text/csv'],
    ])(
      'stores a real %s file (%s) and returns its metadata without any storage detail',
      async (category, data, name, mime) => {
        const { owner, activity, url } = await setup();
        const res = await upload(
          url,
          owner.token,
          category,
          data,
          name,
          category === 'VOICE_NOTE' ? 'true' : undefined,
        );
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body).toMatchObject({
          activityId: activity.id,
          category,
          fileName: name,
          mimeType: mime,
          sizeBytes: data.length,
        });
        expect(Object.keys(res.body).sort()).toEqual([
          'activityId',
          'category',
          'createdAt',
          'fileName',
          'id',
          'mimeType',
          'recordingNoticeGiven',
          'sizeBytes',
          'uploadedByName',
        ]);
        const row = await prisma.activityAttachment.findUniqueOrThrow({
          where: { id: res.body.id },
        });
        expect(row.sha256).toBe(createHash('sha256').update(data).digest('hex'));
        expect(row.storageKey).toMatch(/^[0-9a-f-]{36}$/);
        expect(row.storageKey).not.toContain(path.parse(name).name);
        expect(await filesOnDisk()).toContain(row.storageKey);
      },
    );

    it('ignores the browser’s declared type and the client’s file name for storage decisions', async () => {
      const { owner, url } = await setup();
      const res = await upload(
        url,
        owner.token,
        'PHOTO',
        JPEG,
        '../../etc/passwd.jpg',
        undefined,
        'text/html',
      );
      expect(res.status).toBe(201);
      expect(res.body.fileName).toBe('passwd.jpg');
      expect(res.body.mimeType).toBe('image/jpeg');
      const row = await prisma.activityAttachment.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.storageKey).not.toContain('passwd');
    });

    it('counts attachments on the report and audits the upload without the file name or contents', async () => {
      const { owner, activity, url, lead } = await setup();
      const res = await upload(url, owner.token, 'DOCUMENT', PDF, 'secret client prices.pdf');
      const detail = await http()
        .get(`/api/v1/leads/${lead.id}/activities/${activity.id}`)
        .set(bearer(owner.token));
      expect(detail.body.attachmentCount).toBe(1);
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: activity.id, action: 'attachment.uploaded' },
      });
      expect(audit?.actorUserId).toBe(owner.user.id);
      expect(audit?.newValues).toMatchObject({
        attachmentId: res.body.id,
        category: 'DOCUMENT',
        sizeBytes: PDF.length,
      });
      expect(JSON.stringify(audit)).not.toContain('secret client prices');
    });
  });

  describe('rejected uploads', () => {
    it.each([
      [
        'an executable renamed to a photo',
        'PHOTO',
        EXE,
        'photo.jpg',
        415,
        'ATTACHMENT_CONTENT_MISMATCH',
      ],
      [
        'an executable renamed to a document',
        'DOCUMENT',
        EXE,
        'form.pdf',
        415,
        'ATTACHMENT_CONTENT_MISMATCH',
      ],
      ['HTML renamed to a photo', 'PHOTO', HTML, 'photo.png', 415, 'ATTACHMENT_CONTENT_MISMATCH'],
      ['HTML renamed to a CSV', 'DOCUMENT', HTML, 'list.csv', 415, 'ATTACHMENT_CONTENT_MISMATCH'],
      ['an SVG', 'PHOTO', SVG, 'logo.svg', 415, 'ATTACHMENT_TYPE_NOT_ALLOWED'],
      ['a PDF named as a photo', 'PHOTO', PDF, 'scan.jpg', 415, 'ATTACHMENT_CONTENT_MISMATCH'],
      [
        'a spreadsheet named as a Word file',
        'DOCUMENT',
        XLSX,
        'form.docx',
        415,
        'ATTACHMENT_CONTENT_MISMATCH',
      ],
      ['an executable by name', 'DOCUMENT', EXE, 'setup.exe', 415, 'ATTACHMENT_TYPE_NOT_ALLOWED'],
      [
        'a file with no extension',
        'PHOTO',
        JPEG,
        'noextension',
        415,
        'ATTACHMENT_TYPE_NOT_ALLOWED',
      ],
      [
        'a photo uploaded as a voice note',
        'VOICE_NOTE',
        JPEG,
        'a.jpg',
        415,
        'ATTACHMENT_TYPE_NOT_ALLOWED',
      ],
      ['an empty file', 'PHOTO', Buffer.alloc(0), 'a.jpg', 400, 'VALIDATION_FAILED'],
    ])(
      'refuses %s and leaves no file or row behind',
      async (_label, category, data, name, status, code) => {
        const { owner, activity, url } = await setup();
        const before = await filesOnDisk();
        const res = await upload(
          url,
          owner.token,
          category,
          data,
          name,
          category === 'VOICE_NOTE' ? 'true' : undefined,
        );
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(await prisma.activityAttachment.count({ where: { activityId: activity.id } })).toBe(
          0,
        );
        expect(await filesOnDisk()).toEqual(before);
      },
    );

    it('refuses a file over the category limit with 413, before storing anything', async () => {
      const { owner, activity, url } = await setup();
      const before = await filesOnDisk();
      const bigPhoto = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
      const res = await upload(url, owner.token, 'PHOTO', bigPhoto, 'big.jpg');
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('ATTACHMENT_TOO_LARGE');
      const bigVoice = Buffer.concat([MP3, Buffer.alloc(20 * 1024 * 1024)]);
      const voice = await uploadVoice(url, owner.token, bigVoice, 'long.mp3');
      expect(voice.status).toBe(413);
      expect(voice.body.code).toBe('ATTACHMENT_TOO_LARGE');
      const huge = Buffer.concat([PDF, Buffer.alloc(26 * 1024 * 1024)]);
      const overall = await upload(url, owner.token, 'DOCUMENT', huge, 'huge.pdf');
      expect(overall.status).toBe(413);
      expect(overall.body.code).toBe('ATTACHMENT_TOO_LARGE');
      expect(await prisma.activityAttachment.count({ where: { activityId: activity.id } })).toBe(0);
      expect(await filesOnDisk()).toEqual(before);
    });

    it('accepts a 24 MB document (limit 25 MB) and a photo just under 10 MB', async () => {
      const { owner, url } = await setup();
      const doc = Buffer.concat([PDF, Buffer.alloc(24 * 1024 * 1024)]);
      expect((await upload(url, owner.token, 'DOCUMENT', doc, 'ok.pdf')).status).toBe(201);
      const photo = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024)]);
      expect((await upload(url, owner.token, 'PHOTO', photo, 'ok.jpg')).status).toBe(201);
    });

    it('needs a file and a valid category, and takes one file only', async () => {
      const { owner, url } = await setup();
      const noFile = await http().post(url).set(bearer(owner.token)).field('category', 'PHOTO');
      expect(noFile.status).toBe(400);
      const badCategory = await upload(url, owner.token, 'VIDEO', JPEG, 'a.jpg');
      expect(badCategory.status).toBe(400);
      const noCategory = await http()
        .post(url)
        .set(bearer(owner.token))
        .attach('file', JPEG, { filename: 'a.jpg' });
      expect(noCategory.status).toBe(400);
      const two = await http()
        .post(url)
        .set(bearer(owner.token))
        .field('category', 'PHOTO')
        .attach('file', JPEG, { filename: 'a.jpg' })
        .attach('file', JPEG, { filename: 'b.jpg' });
      expect(two.status).toBe(400);
    });

    it('stops at 20 attachments per report', async () => {
      const { owner, activity, url } = await setup();
      for (let i = 0; i < 20; i += 1) {
        const ok = await upload(url, owner.token, 'PHOTO', JPEG, `p${i}.jpg`);
        expect(ok.status).toBe(201);
      }
      const before = await filesOnDisk();
      const over = await upload(url, owner.token, 'PHOTO', JPEG, 'one-too-many.jpg');
      expect(over.status).toBe(409);
      expect(over.body.code).toBe('ATTACHMENT_LIMIT_REACHED');
      expect(await filesOnDisk()).toEqual(before);
      expect(await prisma.activityAttachment.count({ where: { activityId: activity.id } })).toBe(
        20,
      );
    });

    it('removes the stored bytes when saving the record fails, so no orphan is left', async () => {
      const { owner, activity, url } = await setup();
      const before = await filesOnDisk();
      // The metadata row and its audit event commit together, so a failing audit write rolls both back.
      const audit = app.get(AuditService);
      const spy = vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('database went away'));
      const res = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('database went away');
      expect(await filesOnDisk()).toEqual(before);
      expect(await prisma.activityAttachment.count({ where: { activityId: activity.id } })).toBe(0);
    });
  });

  describe('downloads', () => {
    it('streams the exact bytes as an attachment, never inline, with safe headers and an audit event', async () => {
      const { owner, lead, activity, url } = await setup();
      const up = await upload(url, owner.token, 'DOCUMENT', PDF, 'price list.pdf');
      const res = await http()
        .get(`${url}/${up.body.id}`)
        .set(bearer(owner.token))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="price list\.pdf"/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['content-length']).toBe(String(PDF.length));
      expect(lead.id).toBeTruthy();
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: activity.id, action: 'attachment.downloaded' },
      });
      expect(audit?.actorUserId).toBe(owner.user.id);
    });

    it('cannot put a hostile file name into a response header', async () => {
      const { owner, url } = await setup();
      const up = await upload(url, owner.token, 'PHOTO', JPEG, 'x"\r\nSet-Cookie: a=b\u202e.jpg');
      expect(up.status).toBe(201);
      const res = await http().get(`${url}/${up.body.id}`).set(bearer(owner.token));
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['content-disposition']).not.toMatch(/[\r\n]/);
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    });

    it('reads a missing stored file as unavailable, not as a crash', async () => {
      const { owner, url } = await setup();
      const up = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      const row = await prisma.activityAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
      await storage.remove(row.storageKey);
      const res = await http().get(`${url}/${up.body.id}`).set(bearer(owner.token));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ATTACHMENT_FILE_UNAVAILABLE');
    });
  });

  describe('authorization', () => {
    it('lets a Director read any report’s files and upload to it, but not strangers or other roles', async () => {
      const { owner, url } = await setup();
      const up = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      const director = await user(SystemRoleKey.Director);
      expect((await http().get(`${url}/${up.body.id}`).set(bearer(director.token))).status).toBe(
        200,
      );
      expect((await upload(url, director.token, 'PHOTO', PNG, 'b.png')).status).toBe(201);
      for (const token of [(await user()).token, (await user(SystemRoleKey.Finance)).token]) {
        const get = await http().get(`${url}/${up.body.id}`).set(bearer(token));
        expect([403, 404]).toContain(get.status);
        expect([403, 404]).toContain((await upload(url, token, 'PHOTO', JPEG, 'c.jpg')).status);
        expect([403, 404]).toContain(
          (await http().delete(`${url}/${up.body.id}`).set(bearer(token)).send({ reason: 'x' }))
            .status,
        );
      }
      expect((await http().get(`${url}/${up.body.id}`)).status).toBe(401);
    });

    it('does not let an attachment id open a file through a different report or lead', async () => {
      const a = await setup();
      const b = await setup();
      const up = await upload(a.url, a.owner.token, 'PHOTO', JPEG, 'a.jpg');
      const wrongActivity = await http().get(`${b.url}/${up.body.id}`).set(bearer(b.owner.token));
      expect(wrongActivity.status).toBe(404);
      expect(wrongActivity.body.code).toBe('ATTACHMENT_NOT_FOUND');
      const crossLead = await http()
        .get(`/api/v1/leads/${b.lead.id}/activities/${a.activity.id}/attachments/${up.body.id}`)
        .set(bearer(b.owner.token));
      expect(crossLead.status).toBe(404);
      const stolen = await http().get(`${a.url}/${up.body.id}`).set(bearer(b.owner.token));
      expect(stolen.status).toBe(404);
      const dir = await user(SystemRoleKey.Director);
      expect(
        (await http().delete(`${b.url}/${up.body.id}`).set(bearer(dir.token)).send({ reason: 'x' }))
          .status,
      ).toBe(404);
    });

    it('lets only the person who recorded a report (or a Director) add files, and only a Director remove them', async () => {
      const owner = await user();
      const director = await user(SystemRoleKey.Director);
      const lead = await makeLead(owner.token);
      const byDirector = await http()
        .post(`/api/v1/leads/${lead.id}/activities`)
        .set(bearer(director.token))
        .send({
          type: 'CALL',
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
          discussion: 'director call',
        });
      const url = `/api/v1/leads/${lead.id}/activities/${byDirector.body.id}/attachments`;
      const forbidden = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe('ACTIVITY_NOT_YOURS');
      const ok = await upload(url, director.token, 'PHOTO', JPEG, 'a.jpg');
      expect(ok.status).toBe(201);
      expect(
        (await http().delete(`${url}/${ok.body.id}`).set(bearer(owner.token)).send({ reason: 'x' }))
          .status,
      ).toBe(403);
      expect((await http().get(`${url}/${ok.body.id}`).set(bearer(owner.token))).status).toBe(200);
    });
  });

  describe('removing', () => {
    const director = () => user(SystemRoleKey.Director);

    it('archives the metadata for a Director with a reason, keeps the stored file and the row, and audits who and why', async () => {
      const { owner, lead, activity, url } = await setup();
      const up = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      const row = await prisma.activityAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
      const dir = await director();
      const gone = await http()
        .delete(`${url}/${up.body.id}`)
        .set(bearer(dir.token))
        .send({ reason: 'Wrong client photo' });
      expect(gone.status).toBe(204);
      expect((await http().get(url).set(bearer(owner.token))).body).toEqual([]);
      expect((await http().get(`${url}/${up.body.id}`).set(bearer(owner.token))).status).toBe(404);
      expect(
        (
          await http()
            .delete(`${url}/${up.body.id}`)
            .set(bearer(dir.token))
            .send({ reason: 'again' })
        ).status,
      ).toBe(404);
      expect(await filesOnDisk()).toContain(row.storageKey);
      const archived = await prisma.activityAttachment.findUniqueOrThrow({
        where: { id: up.body.id },
      });
      expect(archived).toMatchObject({
        archivedByUserId: dir.user.id,
        archivedReason: 'Wrong client photo',
        sizeBytes: JPEG.length,
      });
      expect(archived.archivedAt).not.toBeNull();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: activity.id, action: 'attachment.archived' },
      });
      expect(audit).toMatchObject({ actorUserId: dir.user.id, reason: 'Wrong client photo' });
      expect(JSON.stringify(audit)).not.toContain('a.jpg');
      await expect(
        prisma.activityAttachment.delete({ where: { id: up.body.id } }),
      ).rejects.toThrow();
      const detail = await http()
        .get(`/api/v1/leads/${lead.id}/activities/${activity.id}`)
        .set(bearer(owner.token));
      expect(detail.body).toMatchObject({ attachmentCount: 0, attachmentBytes: 0 });
      expect((await upload(url, owner.token, 'PHOTO', JPEG, 'b.jpg')).status).toBe(201);
    });

    it('is Director only: not the recorder, and a reason is required', async () => {
      const { owner, url } = await setup();
      const up = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      const byOwner = await http()
        .delete(`${url}/${up.body.id}`)
        .set(bearer(owner.token))
        .send({ reason: 'mine' });
      expect(byOwner.status).toBe(403);
      expect(byOwner.body.code).toBe('FORBIDDEN');
      const dir = await director();
      for (const body of [
        {},
        { reason: '   ' },
        { reason: 'x'.repeat(501) },
        { reason: 'ok', extra: 1 },
      ]) {
        const bad = await http().delete(`${url}/${up.body.id}`).set(bearer(dir.token)).send(body);
        expect(bad.status).toBe(400);
      }
      expect((await http().get(url).set(bearer(owner.token))).body).toHaveLength(1);
    });

    it('refuses to change files on an archived report', async () => {
      const { owner, base, url } = await setup();
      const dir = await director();
      await http()
        .post(`${base}/archive`)
        .set(bearer(dir.token))
        .send({ reason: 'Duplicate report' })
        .expect(200);
      const res = await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACTIVITY_ARCHIVED');
    });
  });

  it('writes nothing outside the storage directory and leaves no readable file for a guessed path', async () => {
    const { owner, url } = await setup();
    await upload(url, owner.token, 'PHOTO', JPEG, 'a.jpg');
    for (const file of await filesOnDisk()) {
      const bytes = await readFile(path.join(root, file.slice(0, 2), file));
      expect(bytes.length).toBeGreaterThan(0);
    }
    const probe = await http().get('/api/v1/storage/anything').set(bearer(owner.token));
    expect(probe.status).toBe(404);
  });
});
