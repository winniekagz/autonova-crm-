import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** Emails are stored lower-cased; normalising at the boundary keeps comparisons trivial. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const uuidSchema = z.uuid();

/**
 * Query-string pagination. Values arrive as strings, so they are coerced.
 * Page size is capped so a client cannot request an unbounded list.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Small deny-list of the most common choices that still pass a pure length rule. */
const COMMON_PASSWORDS = new Set([
  'password1234',
  'passw0rd1234',
  '123456789012',
  'qwertyuiop12',
  'qwerty123456',
  'letmein12345',
  'welcome12345',
  'administrator',
  'iloveyou1234',
  'changeme1234',
  'autonova1234',
  'autonovacrm1',
]);

/**
 * Credential policy (docs/06): length over composition rules, plus a deny-list.
 * Not trimmed or normalised: the exact characters the user typed are what get hashed.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'This password is too common',
  })
  .refine((value) => new Set(value).size >= 5, {
    message: 'Must contain at least 5 different characters',
  });

/** Display names: trimmed, 1–120 characters, no control characters (newlines, tabs, NUL...). */
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(120, 'Must be at most 120 characters')
  .refine((value) => !/\p{Cc}/u.test(value), { message: 'Must not contain control characters' });

/** Free-text justification attached to sensitive administrative actions. */
export const reasonSchema = z.string().trim().min(1).max(500);

export const ATTACHMENT_RULES = {
  PHOTO: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
  },
  VOICE_NOTE: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm'],
    extensions: ['mp3', 'm4a', 'wav', 'webm'],
  },
  DOCUMENT: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
    extensions: ['pdf', 'docx', 'xlsx', 'csv'],
  },
} as const;

export type AttachmentRuleCategory = keyof typeof ATTACHMENT_RULES;
export const MAX_ATTACHMENTS_PER_ACTIVITY = 20;
/** Default for the configurable total of all active attachments on one report. */
export const DEFAULT_ACTIVITY_ATTACHMENT_TOTAL_MB = 50;
export const LARGEST_ATTACHMENT_BYTES = Math.max(
  ...Object.values(ATTACHMENT_RULES).map((rule) => rule.maxBytes),
);

/** The extension of a file name, lower-case and without the dot; '' when there is none. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** The category whose rules accept this extension, or null. Used to guess a category from a file name. */
export function categoryForExtension(name: string): AttachmentRuleCategory | null {
  const ext = fileExtension(name);
  const found = (Object.keys(ATTACHMENT_RULES) as AttachmentRuleCategory[]).find((category) =>
    (ATTACHMENT_RULES[category].extensions as readonly string[]).includes(ext),
  );
  return found ?? null;
}

export type AttachmentCheck =
  { ok: true } | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED' };

/** Early check from what the browser knows (size and name). The server re-checks the real content. */
export function checkAttachmentCandidate(
  category: AttachmentRuleCategory,
  file: { name: string; size: number },
): AttachmentCheck {
  const rule = ATTACHMENT_RULES[category];
  if (file.size <= 0) return { ok: false, code: 'EMPTY' };
  if (file.size > rule.maxBytes) return { ok: false, code: 'TOO_LARGE' };
  if (!(rule.extensions as readonly string[]).includes(fileExtension(file.name))) {
    return { ok: false, code: 'TYPE_NOT_ALLOWED' };
  }
  return { ok: true };
}

/**
 * A safe display name: no path parts, no control or bidirectional-override characters, bounded length,
 * and never empty. It is only ever shown and offered as a download name; it never reaches the filesystem.
 */
export function sanitizeFileName(raw: string, fallback = 'file'): string {
  const base = (raw.split(/[\\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069"<>:|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (base === '') return fallback;
  if (base.length <= 120) return base;
  const ext = fileExtension(base);
  const keep = ext ? 120 - ext.length - 1 : 120;
  return ext ? `${base.slice(0, keep)}.${ext}` : base.slice(0, keep);
}
