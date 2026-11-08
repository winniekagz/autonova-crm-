import type { LeadDuplicateMatch } from '@autonova/contracts';

export { normalizePhone } from '../../../common/match-keys.js';

/**
 * Leads are compared by phone only. Several leads for one company are expected (PRD §4.2), so a shared
 * company is not a duplicate; company duplicates are handled by the companies module.
 */
export interface LeadKeys {
  phone: string | null;
}

export function matchedOn(
  candidate: { phoneNormalized: string | null },
  keys: LeadKeys,
): LeadDuplicateMatch[] {
  return keys.phone && candidate.phoneNormalized === keys.phone ? ['PHONE'] : [];
}
