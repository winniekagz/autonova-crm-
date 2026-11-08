import type { LeadDto, MeResponse } from '@autonova/contracts';
import { DIRECTOR } from '@/test/render';

/** A Business Development user: may list, read, create and update leads. */
export const BD: MeResponse = {
  ...DIRECTOR,
  permissions: ['leads:list', 'leads:read', 'leads:create', 'leads:update'],
};
export const READ_ONLY: MeResponse = { ...DIRECTOR, permissions: ['leads:list'] };

export const makeLead = (over: Partial<LeadDto> = {}): LeadDto => {
  const stage = over.stage ?? 'NEW_LEAD';
  const lifecycle = over.lifecycle ?? {
    transitions: stage === 'NEW_LEAD' ? ['VISITS_AND_CALLS'] : [],
    canDisqualify: stage === 'VISITS_AND_CALLS',
    canMarkLost: stage === 'TOR_QUOTE_SENT',
  };
  return {
    id: 'l-1',
    name: 'Achieng Otieno',
    companyName: 'Otieno Logistics',
    company: { id: 'co-1', name: 'Otieno Logistics', archived: false },
    primaryContact: null,
    additionalContacts: [],
    phone: null,
    email: 'achieng@example.test',
    source: 'REFERRAL',
    referrerName: 'Brian',
    productInterest: 'RETAIL_POS',
    legacyProductInterest: null,
    notes: 'Met at the expo',
    estimatedValue: '120000',
    currency: 'KES',
    stage,
    lifecycle,
    lostReason: null,
    lostAt: null,
    disqualificationReason: null,
    revisitOn: null,
    ownerUserId: 'u-1',
    ownerName: 'Dee Director',
    nextAction: 'Call back',
    nextActionAt: '2026-11-10T09:00:00.000Z',
    probability: 40,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
    ...over,
  };
};
/** A paged API answer for any list endpoint (leads, stage history). */
export const page = (items: readonly object[], total = items.length) => ({
  body: { items, page: 1, pageSize: 20, total },
});
