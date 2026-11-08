import { describe, expect, it } from 'vitest';
import { matchedOn, normalizePhone } from './lead-duplicates.js';

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

describe('matchedOn', () => {
  const row = { phoneNormalized: '254712345678' };
  it('matches on the phone key', () => {
    expect(matchedOn(row, { phone: '254712345678' })).toEqual(['PHONE']);
    expect(matchedOn(row, { phone: '254712345679' })).toEqual([]);
  });
  it('never matches on a missing key', () => {
    expect(matchedOn({ phoneNormalized: null }, { phone: null })).toEqual([]);
    expect(matchedOn(row, { phone: null })).toEqual([]);
  });
});
