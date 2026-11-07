import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  looksLikeRefreshToken,
  readCookie,
  refreshTokenExpiry,
} from './refresh-token.js';

describe('refresh token generation', () => {
  it('produces 256 bits of URL-safe randomness and a SHA-256 hex digest', () => {
    const token = generateRefreshToken();
    expect(Buffer.from(token.value, 'base64url')).toHaveLength(32);
    expect(token.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.hash).toBe(hashRefreshToken(token.value));
    expect(token.hash).not.toContain(token.value);
  });

  it('never repeats', () => {
    const values = new Set(Array.from({ length: 500 }, () => generateRefreshToken().value));
    expect(values.size).toBe(500);
  });

  it('hashes to the known SHA-256 of the input', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('looksLikeRefreshToken', () => {
  it('accepts exactly the generated shape', () => {
    expect(looksLikeRefreshToken(generateRefreshToken().value)).toBe(true);
  });

  it.each([
    '',
    'short',
    'a'.repeat(42),
    'a'.repeat(44),
    `${'a'.repeat(42)}=`,
    `${'a'.repeat(42)} `,
  ])('rejects %j', (value) => {
    expect(looksLikeRefreshToken(value)).toBe(false);
  });
});

describe('refreshTokenExpiry', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('uses the token lifetime when the session lasts longer', () => {
    const expiry = refreshTokenExpiry(now, 1000, new Date('2026-02-01T00:00:00Z'));
    expect(expiry.toISOString()).toBe('2026-01-01T00:00:01.000Z');
  });

  it('never outlives the session', () => {
    const sessionEnd = new Date('2026-01-01T00:00:00.500Z');
    expect(refreshTokenExpiry(now, 60_000, sessionEnd)).toEqual(sessionEnd);
  });
});

describe('readCookie', () => {
  it('finds the named cookie among others', () => {
    expect(readCookie('a=1; autonova_refresh=tok-en_1; b=2', 'autonova_refresh')).toBe('tok-en_1');
  });

  it('does not match on a name suffix or prefix', () => {
    expect(readCookie('xautonova_refresh=1; autonova_refresh_2=2', 'autonova_refresh')).toBeNull();
  });

  it('returns null for a missing header, a missing cookie or an empty value', () => {
    expect(readCookie(undefined, 'a')).toBeNull();
    expect(readCookie('b=1', 'a')).toBeNull();
    expect(readCookie('a=', 'a')).toBeNull();
    expect(readCookie('garbage', 'a')).toBeNull();
  });
});
