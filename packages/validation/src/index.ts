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
