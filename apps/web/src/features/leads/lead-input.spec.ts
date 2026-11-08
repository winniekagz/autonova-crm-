import type { LeadDto, LeadInput } from '@autonova/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankInput, toInput, toLeadRequestBody } from './lead-input';

const lead = (over: Partial<LeadDto> = {}): LeadDto => ({
  id: 'l-1',
  name: 'Achieng',
  companyName: null,
  phone: null,
  email: null,
  source: 'WEBSITE',
  referrerName: null,
  productInterest: null,
  notes: null,
  estimatedValue: null,
  currency: 'KES',
  stage: 'NEW_LEAD',
  lifecycle: { transitions: ['VISITS_AND_CALLS'], canDisqualify: true, canMarkLost: false },
  lostReason: null,
  lostAt: null,
  disqualificationReason: null,
  revisitOn: null,
  ownerUserId: 'u-1',
  ownerName: 'Dee',
  nextAction: 'Call',
  nextActionAt: '2026-11-10T09:00:00.000Z',
  probability: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('blankInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('defaults to a website lead in KES with the follow-up due tomorrow', () => {
    expect(blankInput()).toEqual({
      name: '',
      source: 'WEBSITE',
      currency: 'KES',
      nextAction: '',
      nextActionAt: '2026-11-08T10:00:00.000Z',
    });
  });
});

describe('toInput', () => {
  it('omits optional fields that are empty so they are not sent as blanks', () => {
    expect(toInput(lead())).toEqual({
      name: 'Achieng',
      source: 'WEBSITE',
      currency: 'KES',
      nextAction: 'Call',
      nextActionAt: '2026-11-10T09:00:00.000Z',
    });
  });

  it('keeps optional fields that have a value, including a probability of zero', () => {
    const input = toInput(
      lead({ companyName: 'Otieno Ltd', email: 'a@b.test', probability: 0, estimatedValue: '10' }),
    );
    expect(input).toMatchObject({
      companyName: 'Otieno Ltd',
      email: 'a@b.test',
      probability: 0,
      estimatedValue: '10',
    });
  });
});

describe('toLeadRequestBody', () => {
  const base: LeadInput = {
    name: '  Wanjiru  ',
    source: 'REFERRAL',
    currency: 'USD',
    nextAction: 'Send proposal',
    nextActionAt: '2026-11-10T09:00:00.000Z',
    companyName: '  Acme ',
    phone: ' 0700 ',
    email: '  Wanjiru@Example.TEST ',
    referrerName: ' Brian ',
    productInterest: ' Tracking ',
    notes: '  hello  ',
    estimatedValue: ' 500 ',
    probability: 25,
  };

  it('trims text, lower-cases the email and normalises the date', () => {
    expect(toLeadRequestBody(base)).toEqual({
      ...base,
      name: 'Wanjiru',
      companyName: 'Acme',
      phone: '0700',
      email: 'wanjiru@example.test',
      referrerName: 'Brian',
      productInterest: 'Tracking',
      notes: 'hello',
      estimatedValue: '500',
    });
  });

  it('turns missing optional text into empty strings and a blank value into undefined', () => {
    const body = toLeadRequestBody({
      name: 'A',
      source: 'WEBSITE',
      currency: 'KES',
      nextAction: 'x',
      nextActionAt: '2026-11-10T09:00:00.000Z',
      estimatedValue: '   ',
    });
    expect(body).toMatchObject({
      companyName: '',
      phone: '',
      email: '',
      referrerName: '',
      productInterest: '',
      notes: '',
    });
    expect(body.estimatedValue).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const copy = structuredClone(base);
    toLeadRequestBody(base);
    expect(base).toEqual(copy);
  });
});
