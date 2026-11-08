import { LeadSource } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import { createLeadSchema, updateLeadSchema } from './leads.schemas.js';

const valid = {
  name: 'Nairobi Retail',
  source: LeadSource.Referral,
  referrerName: 'Alex',
  currency: 'KES',
  nextAction: 'Call about POS requirements',
  nextActionAt: '2026-11-08T09:00:00.000Z',
};

describe('lead request validation', () => {
  it('requires a referrer name when the source is referral', () => {
    expect(createLeadSchema.safeParse({ ...valid, referrerName: undefined }).success).toBe(false);
  });

  it('accepts a valid lead and preserves decimal money as a string', () => {
    const parsed = createLeadSchema.parse({ ...valid, estimatedValue: '25000.50' });
    expect(parsed.estimatedValue).toBe('25000.50');
  });

  it('rejects invalid currency, probability and unknown owner/stage fields', () => {
    expect(createLeadSchema.safeParse({ ...valid, currency: 'EUR' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, probability: 101 }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, ownerUserId: 'anything' }).success).toBe(false);
    expect(updateLeadSchema.safeParse({ stage: 'WON' }).success).toBe(false);
  });
});
