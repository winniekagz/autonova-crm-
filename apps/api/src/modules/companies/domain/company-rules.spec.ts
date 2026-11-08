import { describe, expect, it } from 'vitest';
import {
  companyMatches,
  isDefiniteDuplicate,
  isValidKraPin,
  normalizeKraPin,
  normalizeLinks,
} from './company-rules.js';
import { normalizeEmail, textOrNull } from './contact-rules.js';

describe('KRA PIN', () => {
  it.each([
    [' a123456789b ', 'A123456789B'],
    ['A 123 456 789 B', 'A123456789B'],
    ['', null],
    ['   ', null],
    [undefined, null],
  ])('normalises %j', (raw, expected) => {
    expect(normalizeKraPin(raw)).toBe(expected);
  });

  it('accepts a letter, nine digits and a letter, and nothing else', () => {
    expect(isValidKraPin('A123456789B')).toBe(true);
    for (const bad of [
      '123456789',
      'A12345678B',
      'A1234567890B',
      'AB23456789B',
      'A123456789',
      'a123456789b',
    ]) {
      expect(isValidKraPin(bad), bad).toBe(false);
    }
  });
});

describe('company duplicate matching', () => {
  const row = { kraPin: 'A123456789B', nameNormalized: 'acme' };
  it('reports which key matched', () => {
    expect(companyMatches(row, { kraPin: 'A123456789B', name: 'other' })).toEqual(['KRA_PIN']);
    expect(companyMatches(row, { kraPin: null, name: 'acme' })).toEqual(['NAME']);
    expect(companyMatches(row, { kraPin: 'A123456789B', name: 'acme' })).toEqual([
      'KRA_PIN',
      'NAME',
    ]);
    expect(companyMatches(row, { kraPin: null, name: null })).toEqual([]);
  });
  it('treats only a KRA PIN match as definite', () => {
    expect(isDefiniteDuplicate(['KRA_PIN'])).toBe(true);
    expect(isDefiniteDuplicate(['NAME'])).toBe(false);
  });
});

describe('small normalisers', () => {
  it('deduplicates and trims social links, keeping order', () => {
    expect(normalizeLinks([' https://a.test ', 'https://b.test', 'https://a.test', ''])).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
    expect(normalizeLinks(undefined)).toEqual([]);
  });
  it('lower-cases email and turns blanks into null', () => {
    expect(normalizeEmail('  Wanjiru@Example.TEST ')).toBe('wanjiru@example.test');
    expect(normalizeEmail('  ')).toBeNull();
    expect(textOrNull('  CFO ')).toBe('CFO');
    expect(textOrNull('')).toBeNull();
  });
});
