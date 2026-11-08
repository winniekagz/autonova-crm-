import { describe, expect, it } from 'vitest';
import { leadFormSchema } from './lead-form-schema';

const valid = {
  name: 'Achieng Otieno',
  source: 'WEBSITE',
  currency: 'KES',
  nextAction: 'Call back',
  nextActionAt: '2026-11-10T09:00:00.000Z',
};
const messages = (input: object) =>
  Object.fromEntries(
    (leadFormSchema.safeParse({ ...valid, ...input }).error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );

describe('leadFormSchema', () => {
  it('accepts the minimum a lead needs', () => {
    expect(leadFormSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts only the product catalogue, or no product', () => {
    expect(leadFormSchema.safeParse({ ...valid, productInterest: 'ERP' }).success).toBe(true);
    expect(leadFormSchema.safeParse({ ...valid, productInterest: null }).success).toBe(true);
    expect(leadFormSchema.safeParse({ ...valid, productInterest: 'Fleet tracking' }).success).toBe(
      false,
    );
  });

  it('accepts a fully filled lead', () => {
    expect(
      leadFormSchema.safeParse({
        ...valid,
        companyName: 'Otieno Logistics',
        phone: '+254 700 000000',
        email: 'achieng@example.test',
        referrerName: 'Brian',
        productInterest: 'RETAIL_POS',
        notes: 'Met at the expo',
        estimatedValue: '120000.50',
        probability: 40,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['name', { name: '' }, "Enter the lead's name."],
    ['name', { name: '   ' }, "Enter the lead's name."],
    ['nextAction', { nextAction: ' ' }, 'Enter the next action.'],
    ['email', { email: 'not-an-email' }, 'Enter a valid email address.'],
    [
      'estimatedValue',
      { estimatedValue: '-5' },
      'Use a non-negative amount with up to two decimals.',
    ],
    [
      'estimatedValue',
      { estimatedValue: '1.234' },
      'Use a non-negative amount with up to two decimals.',
    ],
    [
      'estimatedValue',
      { estimatedValue: 'ten' },
      'Use a non-negative amount with up to two decimals.',
    ],
    ['probability', { probability: 101 }, 'Enter a whole number from 0 to 100.'],
    ['probability', { probability: -1 }, 'Enter a whole number from 0 to 100.'],
    ['probability', { probability: 12.5 }, 'Enter a whole number from 0 to 100.'],
    ['probability', { probability: Number.NaN }, 'Enter a whole number from 0 to 100.'],
    ['nextActionAt', { nextActionAt: 'not a date' }, 'Choose a follow-up date.'],
  ])('rejects a bad %s: %j', (field, input, message) => {
    expect(messages(input)[field]).toBe(message);
  });

  it('treats blank optional fields as not provided', () => {
    for (const input of [
      { email: '' },
      { email: '  ' },
      { estimatedValue: '' },
      { companyName: '   ' },
      { probability: undefined },
    ]) {
      expect(leadFormSchema.safeParse({ ...valid, ...input }).success).toBe(true);
    }
  });

  it('accepts a probability of exactly 0 and 100', () => {
    expect(leadFormSchema.safeParse({ ...valid, probability: 0 }).success).toBe(true);
    expect(leadFormSchema.safeParse({ ...valid, probability: 100 }).success).toBe(true);
  });

  it('enforces the same length limits as the API, after trimming', () => {
    expect(messages({ name: 'x'.repeat(201) }).name).toMatch(/at most 200/);
    expect(leadFormSchema.safeParse({ ...valid, name: ` ${'x'.repeat(200)} ` }).success).toBe(true);
    expect(messages({ phone: 'x'.repeat(41) }).phone).toMatch(/at most 40/);
    expect(messages({ notes: 'x'.repeat(5001) }).notes).toMatch(/at most 5000/);
    expect(messages({ nextAction: 'x'.repeat(501) }).nextAction).toMatch(/at most 500/);
  });

  it('requires a referrer only for referral leads', () => {
    expect(messages({ source: 'REFERRAL' }).referrerName).toBe(
      'Enter the referrer for a referral lead.',
    );
    expect(messages({ source: 'REFERRAL', referrerName: '  ' }).referrerName).toBeDefined();
    expect(
      leadFormSchema.safeParse({ ...valid, source: 'REFERRAL', referrerName: 'Brian' }).success,
    ).toBe(true);
    expect(leadFormSchema.safeParse({ ...valid, source: 'INSTAGRAM' }).success).toBe(true);
  });

  it('rejects a source or currency the API does not know', () => {
    expect(leadFormSchema.safeParse({ ...valid, source: 'HACKED' }).success).toBe(false);
    expect(leadFormSchema.safeParse({ ...valid, currency: 'EUR' }).success).toBe(false);
  });
});
