import { describe, expect, it } from 'vitest';
import { matchedOn, normalizeCompanyName, normalizePhone } from './lead-duplicates.js';

describe('normalizePhone', () => {
  it.each([
    ['0712 345 678', '254712345678'],
    ['+254 712-345-678', '254712345678'],
    ['(0712) 345.678', '254712345678'],
    ['00254712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['+1 (415) 555-0132', '14155550132'],
  ])('reads %s as %s', (raw, key) => {
    expect(normalizePhone(raw)).toBe(key);
  });

  it.each([undefined, null, '', '   ', '12', 'n/a', '1234567890123456'])(
    'gives no key for %s',
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );

  it('does not treat different numbers as equal', () => {
    expect(normalizePhone('0712 345 678')).not.toBe(normalizePhone('0712 345 679'));
  });
});

describe('normalizeCompanyName', () => {
  it.each([
    ['  ACME   Ltd. ', 'acme'],
    ['Acme Limited', 'acme'],
    ['acme', 'acme'],
    ["Njeri's Café & Co.", 'njeri s café co'],
    ['Rural Water Management Solutions(K) Limited', 'rural water management solutions k'],
  ])('reads %s as %s', (raw, key) => {
    expect(normalizeCompanyName(raw)).toBe(key);
  });

  it('only drops a trailing legal suffix, not a word inside the name', () => {
    expect(normalizeCompanyName('Limited Edition Prints')).toBe('limited edition prints');
  });

  it.each([undefined, null, '', '  ', '...'])('gives no key for %s', (raw) => {
    expect(normalizeCompanyName(raw)).toBeNull();
  });
});

describe('matchedOn', () => {
  const row = { phoneNormalized: '254712345678', companyNameNormalized: 'acme' };
  it('reports every key that matches', () => {
    expect(matchedOn(row, { phone: '254712345678', company: 'acme' })).toEqual([
      'PHONE',
      'COMPANY',
    ]);
    expect(matchedOn(row, { phone: '254712345678', company: 'other' })).toEqual(['PHONE']);
    expect(matchedOn(row, { phone: null, company: 'acme' })).toEqual(['COMPANY']);
  });
  it('never matches on a missing key', () => {
    expect(
      matchedOn(
        { phoneNormalized: null, companyNameNormalized: null },
        { phone: null, company: null },
      ),
    ).toEqual([]);
  });
});
