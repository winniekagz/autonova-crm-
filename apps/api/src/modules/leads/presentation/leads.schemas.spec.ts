import { LeadSource } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import { createLeadSchema, duplicateCheckSchema, updateLeadSchema } from './leads.schemas.js';

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

  it('accepts only catalogue product interests and rejects free text', () => {
    expect(createLeadSchema.safeParse({ ...valid, productInterest: 'RETAIL_POS' }).success).toBe(
      true,
    );
    expect(createLeadSchema.safeParse({ ...valid, productInterest: 'Retail POS' }).success).toBe(
      false,
    );
    expect(createLeadSchema.safeParse({ ...valid, productInterest: 'Website' }).success).toBe(
      false,
    );
    expect(updateLeadSchema.safeParse({ productInterest: null }).success).toBe(true);
  });

  it('treats the duplicate acknowledgement as a flag, not as a lead field', () => {
    expect(createLeadSchema.safeParse({ ...valid, acknowledgeDuplicates: true }).success).toBe(
      true,
    );
    expect(createLeadSchema.safeParse({ ...valid, acknowledgeDuplicates: 'yes' }).success).toBe(
      false,
    );
    expect(updateLeadSchema.safeParse({ acknowledgeDuplicates: true }).success).toBe(false);
    expect(
      updateLeadSchema.safeParse({ phone: '0712345678', acknowledgeDuplicates: true }).success,
    ).toBe(true);
  });

  it('links a company and contacts by id, and refuses the old free-text company field', () => {
    const id = '0192f1a0-0000-7000-8000-000000000001';
    expect(
      createLeadSchema.safeParse({ ...valid, companyId: id, primaryContactId: id }).success,
    ).toBe(true);
    expect(createLeadSchema.safeParse({ ...valid, companyId: 'acme' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, companyName: 'Acme' }).success).toBe(false);
    expect(updateLeadSchema.safeParse({ companyName: 'Acme' }).success).toBe(false);
    expect(updateLeadSchema.safeParse({ companyId: id }).success).toBe(false);
  });

  it('validates the duplicate-check body strictly', () => {
    expect(duplicateCheckSchema.safeParse({ phone: '0712345678' }).success).toBe(true);
    expect(duplicateCheckSchema.safeParse({ excludeLeadId: 'not-a-uuid' }).success).toBe(false);
    expect(duplicateCheckSchema.safeParse({ ownerUserId: 'x' }).success).toBe(false);
  });
});
