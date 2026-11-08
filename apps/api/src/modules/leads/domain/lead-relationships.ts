export const MAX_ADDITIONAL_CONTACTS = 20;

export interface LeadLinks {
  companyId: string | null;
  primaryContactId: string | null;
  additionalContactIds: readonly string[];
}

export type LeadLinkErrorCode =
  'CONTACT_REQUIRES_COMPANY' | 'DUPLICATE_CONTACT' | 'TOO_MANY_CONTACTS';

export type LeadLinkResult = { ok: true } | { ok: false; code: LeadLinkErrorCode };

/** Pure shape rules; whether the company and contacts exist and belong together is checked against data. */
export function validateLeadLinks(links: LeadLinks): LeadLinkResult {
  const contactIds = [
    ...(links.primaryContactId ? [links.primaryContactId] : []),
    ...links.additionalContactIds,
  ];
  if (contactIds.length > 0 && !links.companyId) {
    return { ok: false, code: 'CONTACT_REQUIRES_COMPANY' };
  }
  if (links.additionalContactIds.length > MAX_ADDITIONAL_CONTACTS) {
    return { ok: false, code: 'TOO_MANY_CONTACTS' };
  }
  if (new Set(contactIds).size !== contactIds.length) {
    return { ok: false, code: 'DUPLICATE_CONTACT' };
  }
  return { ok: true };
}
