import type { LeadDuplicateMatch } from '@autonova/contracts';

/**
 * Comparison keys for duplicate detection. These rules are mirrored in SQL by the
 * `lead_capture_completion` migration backfill; change both together.
 *
 * Phone: digits only, in international form without "+". A leading 0 or a bare 9-digit mobile
 * number is read as Kenyan (254). Anything that cannot be a phone number yields no key.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  let key: string;
  if (trimmed.startsWith('+')) key = digits;
  else if (digits.startsWith('00')) key = digits.slice(2);
  else if (digits.startsWith('0')) key = `254${digits.slice(1)}`;
  else if (/^[17]\d{8}$/.test(digits)) key = `254${digits}`;
  else key = digits;
  return key.length >= 7 && key.length <= 15 ? key : null;
}

const LEGAL_SUFFIX = / (limited|ltd|plc|inc|llc)$/;

/** Company: lower-case words, punctuation and spacing ignored, one trailing legal suffix dropped. */
export function normalizeCompanyName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const words = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return words.replace(LEGAL_SUFFIX, '').trim() || null;
}

export interface LeadKeys {
  phone: string | null;
  company: string | null;
}

export function matchedOn(
  candidate: { phoneNormalized: string | null; companyNameNormalized: string | null },
  keys: LeadKeys,
): LeadDuplicateMatch[] {
  const matches: LeadDuplicateMatch[] = [];
  if (keys.phone && candidate.phoneNormalized === keys.phone) matches.push('PHONE');
  if (keys.company && candidate.companyNameNormalized === keys.company) matches.push('COMPANY');
  return matches;
}
