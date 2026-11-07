import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import { generateRefreshToken, refreshTokenExpiry } from '../domain/refresh-token.js';
import { AuthRepository, type Db } from '../infrastructure/auth.repository.js';

/** A freshly issued token. `value` is shown to the browser once, in the cookie, and never stored. */
export interface IssuedRefreshToken {
  value: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly repository: AuthRepository,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000;
  }

  /** Stores the hash of a new token for the session. Call inside the transaction that needs it. */
  async issue(
    db: Db,
    input: { sessionId: string; sessionExpiresAt: Date; now: Date },
  ): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(input.now, this.ttlMs, input.sessionExpiresAt);
    await this.repository.createRefreshToken(db, {
      sessionId: input.sessionId,
      tokenHash: token.hash,
      createdAt: input.now,
      expiresAt,
    });
    return { value: token.value, expiresAt };
  }
}
