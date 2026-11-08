import type { CompanyDuplicateMatch } from '@autonova/contracts';

/** Kenyan KRA PIN: a letter, nine digits, a letter (for example A123456789B). */
export const KRA_PIN_PATTERN = /^[A-Z]\d{9}[A-Z]$/;

/** Upper-cases and removes spacing; returns null for blank input. Validity is checked separately. */
export function normalizeKraPin(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  return value === '' ? null : value;
}

export const isValidKraPin = (value: string) => KRA_PIN_PATTERN.test(value);

/** Outcome of comparing a company being saved with an existing one. */
export interface CompanyKeys {
  kraPin: string | null;
  name: string | null;
}

export function companyMatches(
  candidate: { kraPin: string | null; nameNormalized: string },
  keys: CompanyKeys,
): CompanyDuplicateMatch[] {
  const matches: CompanyDuplicateMatch[] = [];
  if (keys.kraPin && candidate.kraPin === keys.kraPin) matches.push('KRA_PIN');
  if (keys.name && candidate.nameNormalized === keys.name) matches.push('NAME');
  return matches;
}

/** A matching KRA PIN is the same legal entity: saving is refused. A name match only warns. */
export const isDefiniteDuplicate = (matches: readonly CompanyDuplicateMatch[]) =>
  matches.includes('KRA_PIN');

/** Social links are stored as plain https URLs, deduplicated, in the order given. */
export function normalizeLinks(links: readonly string[] | undefined): string[] {
  return [...new Set((links ?? []).map((link) => link.trim()).filter(Boolean))];
}
