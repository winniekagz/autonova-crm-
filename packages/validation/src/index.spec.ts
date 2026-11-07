import { describe, expect, it } from 'vitest';
import {
  MAX_PAGE_SIZE,
  emailSchema,
  fullNameSchema,
  paginationQuerySchema,
  passwordSchema,
  reasonSchema,
  uuidSchema,
} from './index.js';

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Sam@Autonova.CO.KE ')).toBe('sam@autonova.co.ke');
  });
  it('rejects malformed emails', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });
  it('coerces query strings', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });
  it('caps page size', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
  it('rejects page 0', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accepts a uuid and rejects junk', () => {
    expect(uuidSchema.safeParse('0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60').success).toBe(true);
    expect(uuidSchema.safeParse('123').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a long passphrase with spaces', () => {
    expect(passwordSchema.safeParse('correct horse battery staple').success).toBe(true);
  });
  it('rejects short passwords', () => {
    expect(passwordSchema.safeParse('Sh0rt!pw').success).toBe(false);
  });
  it('rejects overlong passwords (hashing DoS guard)', () => {
    expect(passwordSchema.safeParse('a1'.repeat(65)).success).toBe(false);
  });
  it('rejects common passwords case-insensitively', () => {
    expect(passwordSchema.safeParse('PassWord1234').success).toBe(false);
  });
  it('rejects trivially repetitive passwords', () => {
    expect(passwordSchema.safeParse('aaaaaaaaaaaaaaaa').success).toBe(false);
  });
  it('does not trim: surrounding spaces are part of the secret', () => {
    expect(passwordSchema.parse('  padded passphrase  ')).toBe('  padded passphrase  ');
  });
});

describe('fullNameSchema', () => {
  it('trims and accepts ordinary names', () => {
    expect(fullNameSchema.parse('  Wanjiru Kamau ')).toBe('Wanjiru Kamau');
    expect(fullNameSchema.parse('Ngũgĩ wa Thiong’o')).toBe('Ngũgĩ wa Thiong’o');
  });
  it('rejects empty, overlong and control-character names', () => {
    expect(fullNameSchema.safeParse('   ').success).toBe(false);
    expect(fullNameSchema.safeParse('a'.repeat(121)).success).toBe(false);
    expect(fullNameSchema.safeParse('line\nbreak').success).toBe(false);
    expect(fullNameSchema.safeParse('nul\u0000byte').success).toBe(false);
  });
});

describe('reasonSchema', () => {
  it('requires non-blank text of at most 500 characters', () => {
    expect(reasonSchema.safeParse('  duplicate account ').success).toBe(true);
    expect(reasonSchema.safeParse('   ').success).toBe(false);
    expect(reasonSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
});
