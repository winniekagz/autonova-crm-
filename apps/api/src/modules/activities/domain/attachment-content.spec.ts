import { describe, expect, it } from 'vitest';
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
  XLSX,
} from '../../../../test/upload-fixtures.js';
import { checkAttachmentContent } from './attachment-content.js';

describe('checkAttachmentContent', () => {
  it.each([
    ['PHOTO', JPEG, 'site.jpg', 'image/jpeg'],
    ['PHOTO', PNG, 'site.png', 'image/png'],
    ['VOICE_NOTE', MP3, 'note.mp3', 'audio/mpeg'],
    ['VOICE_NOTE', M4A, 'note.m4a', 'audio/x-m4a'],
    ['DOCUMENT', PDF, 'price list.pdf', 'application/pdf'],
    [
      'DOCUMENT',
      DOCX,
      'form.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'DOCUMENT',
      XLSX,
      'prices.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['DOCUMENT', CSV, 'contacts.csv', 'text/csv'],
  ] as const)('accepts a real %s file (%s)', async (category, data, name, mimeType) => {
    expect(await checkAttachmentContent(category, data, name)).toEqual({ ok: true, mimeType });
  });

  it('refuses content that does not match the declared name, whatever the extension says', async () => {
    expect(await checkAttachmentContent('PHOTO', PDF, 'looks-like.jpg')).toEqual({
      ok: false,
      code: 'CONTENT_MISMATCH',
    });
    expect(await checkAttachmentContent('DOCUMENT', JPEG, 'scan.pdf')).toEqual({
      ok: false,
      code: 'CONTENT_MISMATCH',
    });
    expect(await checkAttachmentContent('DOCUMENT', XLSX, 'form.docx')).toEqual({
      ok: false,
      code: 'CONTENT_MISMATCH',
    });
    expect(await checkAttachmentContent('PHOTO', PNG, 'x.jpg')).toEqual({
      ok: false,
      code: 'CONTENT_MISMATCH',
    });
  });

  it('refuses executables, markup and SVG even when renamed to an allowed extension', async () => {
    for (const [data, name, category] of [
      [EXE, 'photo.jpg', 'PHOTO'],
      [EXE, 'form.pdf', 'DOCUMENT'],
      [HTML, 'photo.png', 'PHOTO'],
      [HTML, 'list.csv', 'DOCUMENT'],
      [SVG, 'logo.png', 'PHOTO'],
    ] as const) {
      const result = await checkAttachmentContent(category, data, name);
      expect(result.ok, name).toBe(false);
    }
  });

  it('refuses extensions that are not allowed for the category, and the dangerous ones outright', async () => {
    expect(await checkAttachmentContent('PHOTO', JPEG, 'photo.svg')).toEqual({
      ok: false,
      code: 'TYPE_NOT_ALLOWED',
    });
    expect(await checkAttachmentContent('DOCUMENT', PDF, 'm.html')).toEqual({
      ok: false,
      code: 'TYPE_NOT_ALLOWED',
    });
    expect(await checkAttachmentContent('DOCUMENT', EXE, 'setup.exe')).toEqual({
      ok: false,
      code: 'TYPE_NOT_ALLOWED',
    });
    expect(await checkAttachmentContent('PHOTO', PDF, 'noextension')).toEqual({
      ok: false,
      code: 'TYPE_NOT_ALLOWED',
    });
    expect(await checkAttachmentContent('VOICE_NOTE', JPEG, 'a.jpg')).toEqual({
      ok: false,
      code: 'TYPE_NOT_ALLOWED',
    });
  });

  it('refuses empty files and files over the limit for their category', async () => {
    expect(await checkAttachmentContent('PHOTO', Buffer.alloc(0), 'a.jpg')).toEqual({
      ok: false,
      code: 'EMPTY',
    });
    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
    expect(await checkAttachmentContent('PHOTO', big, 'big.jpg')).toEqual({
      ok: false,
      code: 'TOO_LARGE',
    });
    expect(
      await checkAttachmentContent(
        'DOCUMENT',
        Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]),
        'ok.pdf',
      ),
    ).toMatchObject({ ok: true });
  });

  it('does not accept binary data as a CSV', async () => {
    expect(
      await checkAttachmentContent('DOCUMENT', Buffer.from([0, 1, 2, 3, 255, 254]), 'x.csv'),
    ).toEqual({ ok: false, code: 'CONTENT_MISMATCH' });
  });
});
