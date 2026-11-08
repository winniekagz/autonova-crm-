import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Pure helpers for Director MFA: encrypting the TOTP secret at rest and generating or hashing
 * recovery codes. They touch no database and no framework, so the formats that decide whether
 * stored data can still be read are covered by plain unit tests.
 *
 * The TOTP secret is AES-256-GCM encrypted (a fresh 96-bit IV per secret; `tag` authenticates it).
 * Recovery codes are shown once, 128 bits of randomness, and stored only as a SHA-256 digest.
 */

export type Ciphertext = { ciphertext: string; iv: string; tag: string };

export function encryptSecret(secret: string, key: Buffer): Ciphertext {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptSecret(value: Ciphertext, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** `XXXX-XXXX-...` (8 groups of 4 hex characters, upper case). */
export function recoveryCode(): string {
  const raw = randomBytes(16).toString('hex').toUpperCase();
  return Array.from({ length: 8 }, (_, index) => raw.slice(index * 4, index * 4 + 4)).join('-');
}

/** Dashes and case are ignored, so a code typed with or without them matches. */
export function recoveryHash(value: string): string {
  return createHash('sha256').update(value.replaceAll('-', '').toUpperCase()).digest('hex');
}
