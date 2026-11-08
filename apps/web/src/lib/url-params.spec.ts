import { describe, expect, it } from 'vitest';
import {
  MAX_SEARCH_LENGTH,
  pageParam,
  readChoice,
  readPage,
  readSearch,
  withParams,
} from './url-params';

describe('readPage', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['999999', 999999],
  ])('accepts %s', (value, expected) => expect(readPage(value)).toBe(expected));

  it.each([null, '', '0', '-3', '1.5', 'abc', '1e3', '0007', ' 2', '2 ', '1000000', '＋1'])(
    'falls back to page 1 for %j',
    (value) => expect(readPage(value)).toBe(1),
  );
});

describe('readSearch', () => {
  it('trims and defaults to empty', () => {
    expect(readSearch('  wanj ')).toBe('wanj');
    expect(readSearch(null)).toBe('');
    expect(readSearch('   ')).toBe('');
  });

  it('never exceeds what the API accepts', () => {
    expect(readSearch('x'.repeat(500))).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe('readChoice', () => {
  const allowed = ['ACTIVE', 'DISABLED'] as const;

  it('returns an allowed value and rejects everything else', () => {
    expect(readChoice('ACTIVE', allowed)).toBe('ACTIVE');
    expect(readChoice('active', allowed)).toBe('');
    expect(readChoice('HACKED', allowed)).toBe('');
    expect(readChoice('', allowed)).toBe('');
    expect(readChoice(null, allowed)).toBe('');
  });
});

describe('pageParam', () => {
  it('omits the default page', () => {
    expect(pageParam(1)).toBeNull();
    expect(pageParam(0)).toBeNull();
    expect(pageParam(3)).toBe(3);
  });
});

describe('withParams', () => {
  it('sets, replaces and keeps untouched parameters', () => {
    expect(withParams('status=ACTIVE&page=3', { q: 'wanj', page: null })).toBe(
      '?status=ACTIVE&q=wanj',
    );
    expect(withParams(new URLSearchParams('q=a'), { q: 'b' })).toBe('?q=b');
  });

  it('removes a parameter for null, undefined and empty text', () => {
    expect(withParams('a=1&b=2&c=3', { a: null, b: undefined, c: '' })).toBe('');
  });

  it('stringifies numbers and encodes unsafe text', () => {
    expect(withParams('', { page: 2 })).toBe('?page=2');
    expect(withParams('', { q: 'a&b=c d' })).toBe('?q=a%26b%3Dc+d');
  });

  it('returns an empty string, not a bare "?", when nothing is left', () => {
    expect(withParams('q=a', { q: null })).toBe('');
  });

  it('does not mutate the URLSearchParams it was given', () => {
    const current = new URLSearchParams('q=a');
    withParams(current, { q: 'b' });
    expect(current.get('q')).toBe('a');
  });
});
