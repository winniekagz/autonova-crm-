import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes = 256 bits of entropy, encoded as 43 URL-safe base64 characters. */
const TOKEN_BYTES = 32;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export interface GeneratedRefreshToken {
  /** Goes to the browser (HttpOnly cookie) and nowhere else. Never stored, never logged. */
  value: string;
  /** What the database stores and looks up. */
  hash: string;
}

export function hashRefreshToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateRefreshToken(): GeneratedRefreshToken {
  const value = randomBytes(TOKEN_BYTES).toString('base64url');
  return { value, hash: hashRefreshToken(value) };
}

/** Cheap shape check so garbage never reaches the database. A match proves nothing about validity. */
export function looksLikeRefreshToken(value: string): boolean {
  return TOKEN_FORMAT.test(value);
}

/**
 * A refresh token lives for `ttlMs` from issue (this acts as the idle timeout, because every use
 * issues a fresh one) but never outlives its session's absolute lifetime.
 */
export function refreshTokenExpiry(now: Date, ttlMs: number, sessionExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + ttlMs, sessionExpiresAt.getTime()));
}

/** Reads one cookie from a raw `Cookie` header. Returns null when absent or empty. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value === '' ? null : value;
  }
  return null;
}
