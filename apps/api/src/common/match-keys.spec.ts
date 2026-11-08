import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from './match-keys.js';

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
