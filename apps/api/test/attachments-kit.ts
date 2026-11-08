import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { companyKit } from './companies-fixtures.js';
import { bearer } from './helpers.js';

/** Shared setup for the attachment and governance e2e specs: one lead, one visit report, upload helpers. */
export function attachmentsKit(getApp: () => NestExpressApplication) {
  const kit = companyKit(getApp);
  const { http, tag, user, makeLead } = kit;

  const root = path.resolve('./.e2e-storage');
  const filesOnDisk = async (): Promise<string[]> => {
    const out: string[] = [];
    for (const shard of await readdir(root).catch(() => [])) {
      for (const f of await readdir(path.join(root, shard))) out.push(f);
    }
    return out;
  };

  const setup = async (type: 'VISIT' | 'CALL' = 'VISIT') => {
    const owner = await user();
    const lead = await makeLead(owner.token);
    const res = await http()
      .post(`/api/v1/leads/${lead.id}/activities`)
      .set(bearer(owner.token))
      .send({
        type,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        discussion: `d ${tag()}`,
      });
    return {
      owner,
      lead,
      activity: res.body as { id: string },
      base: `/api/v1/leads/${lead.id}/activities/${res.body.id}`,
      url: `/api/v1/leads/${lead.id}/activities/${res.body.id}/attachments`,
    };
  };

  const upload = (
    url: string,
    token: string,
    category: string,
    data: Buffer,
    name: string,
    notice?: 'true' | 'false',
    mime = 'application/octet-stream',
  ) => {
    const req = http().post(url).set(bearer(token)).field('category', category);
    if (notice !== undefined) req.field('recordingNoticeGiven', notice);
    return req.attach('file', data, { filename: name, contentType: mime });
  };

  /** A voice note with the participants' notice confirmed, the normal case. */
  const uploadVoice = (url: string, token: string, data: Buffer, name: string) =>
    upload(url, token, 'VOICE_NOTE', data, name, 'true');

  return { ...kit, root, filesOnDisk, setup, upload, uploadVoice };
}
