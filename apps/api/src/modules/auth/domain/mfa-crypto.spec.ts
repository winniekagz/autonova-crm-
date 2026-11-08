import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, recoveryCode, recoveryHash } from './mfa-crypto.js';

const key = randomBytes(32);

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret('JBSWY3DPEHPK3PXP', key), key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('stores nothing readable and uses a fresh IV every time', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(JSON.stringify(a)).not.toContain('JBSWY3DPEHPK3PXP');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(Buffer.from(a.iv, 'base64url')).toHaveLength(12);
    expect(Buffer.from(a.tag, 'base64url')).toHaveLength(16);
  });

  it('refuses the wrong key', () => {
    const sealed = encryptSecret('secret', key);
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
  });

  it.each(['ciphertext', 'iv', 'tag'] as const)('detects tampering with the %s', (field) => {
    const sealed = encryptSecret('secret', key);
    const flipped = Buffer.from(sealed[field], 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() =>
      decryptSecret({ ...sealed, [field]: flipped.toString('base64url') }, key),
    ).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptSecret('secret', randomBytes(16))).toThrow();
  });
});

describe('recoveryCode', () => {
  it('has eight upper-case hex groups of four', () => {
    expect(recoveryCode()).toMatch(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/);
  });

  it('never repeats', () => {
    expect(new Set(Array.from({ length: 500 }, recoveryCode)).size).toBe(500);
  });
});

describe('recoveryHash', () => {
  it('is a SHA-256 hex digest that does not contain the code', () => {
    const code = recoveryCode();
    expect(recoveryHash(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(recoveryHash(code)).not.toContain(code.replaceAll('-', ''));
  });

  it('ignores dashes and letter case, so a retyped code still matches', () => {
    const code = recoveryCode();
    const plain = code.replaceAll('-', '');
    expect(recoveryHash(plain)).toBe(recoveryHash(code));
    expect(recoveryHash(code.toLowerCase())).toBe(recoveryHash(code));
  });

  it('differs for different codes', () => {
    expect(recoveryHash('AAAA-AAAA')).not.toBe(recoveryHash('AAAA-AAAB'));
  });
});
