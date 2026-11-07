import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify, type Options } from '@node-rs/argon2';
import type { Env } from '../../../config/env.js';

/**
 * argon2id with configurable cost. Hashes are PHC strings that embed their own parameters, so
 * raising the cost later never breaks existing hashes — `needsRehash` tells the login flow to
 * upgrade them transparently.
 */
@Injectable()
export class PasswordHasher {
  // The library's default algorithm is argon2id; the spec asserts the `$argon2id$` prefix so a
  // change of default cannot slip through unnoticed.
  private readonly options: Required<Pick<Options, 'memoryCost' | 'timeCost' | 'parallelism'>>;

  constructor(config: ConfigService<Env, true>) {
    this.options = {
      memoryCost: config.get('ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: config.get('ARGON2_PARALLELISM', { infer: true }),
    };
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  /** Never throws on a malformed stored hash: that is "does not match", not a server error. */
  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false;
    }
  }

  /** True when the stored hash was made with weaker parameters than the current configuration. */
  needsRehash(storedHash: string): boolean {
    const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
    if (!match) return true;
    const [, m, t, p] = match;
    return (
      Number(m) < this.options.memoryCost ||
      Number(t) < this.options.timeCost ||
      Number(p) < this.options.parallelism
    );
  }
}
