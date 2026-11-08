import { fileTypeFromBuffer } from 'file-type';
import { ATTACHMENT_RULES, fileExtension, type AttachmentRuleCategory } from '@autonova/validation';

export type ContentCheck =
  | { ok: true; mimeType: string }
  | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED' | 'CONTENT_MISMATCH' };

/** What the sniffer reports for each type we accept, mapped to the one MIME type we store. */
const CANONICAL: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'audio/x-m4a': 'audio/x-m4a',
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'video/webm': 'audio/webm',
  'audio/webm': 'audio/webm',
  'application/pdf': 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** CSV has no signature. Accept it only if it is plain text: no NUL bytes, valid UTF-8, no markup start. */
function looksLikeCsv(data: Buffer): boolean {
  if (data.includes(0)) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return false;
  }
  const head = text.trimStart().slice(0, 64).toLowerCase();
  return !(head.startsWith('<') || head.startsWith('%pdf') || head.startsWith('mz'));
}

/**
 * Checks the real bytes against the chosen category. The browser's MIME type and the client's file name
 * are never trusted: the name only has to agree with what the bytes turn out to be.
 */
export async function checkAttachmentContent(
  category: AttachmentRuleCategory,
  data: Buffer,
  claimedName: string,
  /** The configured limit for this category; defaults to the shared rule. */
  maxBytes: number = ATTACHMENT_RULES[category].maxBytes,
): Promise<ContentCheck> {
  const rule = ATTACHMENT_RULES[category];
  if (data.length === 0) return { ok: false, code: 'EMPTY' };
  if (data.length > maxBytes) return { ok: false, code: 'TOO_LARGE' };
  const extension = fileExtension(claimedName);
  if (!(rule.extensions as readonly string[]).includes(extension)) {
    return { ok: false, code: 'TYPE_NOT_ALLOWED' };
  }

  const sniffed = await fileTypeFromBuffer(data);
  if (!sniffed) {
    if (category === 'DOCUMENT' && extension === 'csv' && looksLikeCsv(data)) {
      return { ok: true, mimeType: 'text/csv' };
    }
    return { ok: false, code: 'CONTENT_MISMATCH' };
  }
  const mimeType = CANONICAL[sniffed.mime];
  if (!mimeType || !(rule.mimeTypes as readonly string[]).includes(mimeType)) {
    return { ok: false, code: 'CONTENT_MISMATCH' };
  }
  // A .docx that is really a .xlsx (or a .jpg that is a PDF) is refused, not stored under a false name.
  const expected = EXTENSION_TYPES[extension];
  if (expected && !expected.includes(mimeType)) return { ok: false, code: 'CONTENT_MISMATCH' };
  return { ok: true, mimeType };
}

const EXTENSION_TYPES: Record<string, readonly string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  m4a: ['audio/x-m4a', 'audio/mp4'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav'],
  webm: ['audio/webm'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv'],
};
