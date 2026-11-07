import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../config/env.js';
import { PasswordHasher } from './password-hasher.js';

const hasherWith = (overrides: Partial<Env> = {}) => {
  const values = {
    ARGON2_MEMORY_KIB: 19456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
    ...overrides,
  };
  const config = { get: (key: keyof typeof values) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
  return new PasswordHasher(config);
};

describe('PasswordHasher', () => {
  it('hashes with argon2id and verifies the right password only', async () => {
    const hasher = hasherWith();
    const stored = await hasher.hash('correct horse battery staple');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(stored).not.toContain('correct horse');
    expect(await hasher.verify(stored, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(stored, 'correct horse battery stapl3')).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const hasher = hasherWith();
    expect(await hasher.hash('same password here')).not.toBe(
      await hasher.hash('same password here'),
    );
  });

  it('treats a malformed stored hash as a mismatch, not an error', async () => {
    expect(await hasherWith().verify('not-a-hash', 'whatever password')).toBe(false);
  });

  it('flags hashes made with weaker parameters for rehash', async () => {
    const weak = await hasherWith({ ARGON2_TIME_COST: 2 }).hash('a long enough password');
    expect(hasherWith({ ARGON2_TIME_COST: 2 }).needsRehash(weak)).toBe(false);
    expect(hasherWith({ ARGON2_TIME_COST: 3 }).needsRehash(weak)).toBe(true);
    expect(hasherWith({ ARGON2_MEMORY_KIB: 32768 }).needsRehash(weak)).toBe(true);
  });

  it('verifies old hashes after the cost is raised', async () => {
    const stored = await hasherWith({ ARGON2_TIME_COST: 2 }).hash('a long enough password');
    expect(await hasherWith({ ARGON2_TIME_COST: 4 }).verify(stored, 'a long enough password')).toBe(
      true,
    );
  });
});
