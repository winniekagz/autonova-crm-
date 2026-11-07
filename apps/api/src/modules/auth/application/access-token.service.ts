import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { Env } from '../../../config/env.js';

/**
 * The ONLY claims an access token carries (docs/06 "Access-token validation"). Roles and
 * permissions are deliberately absent: they are loaded from the database on every request, so a
 * stale token can never carry stale authority. Do not add claims without a concrete reason.
 */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type AccessTokenVerification =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.ttlSeconds = config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }

  sign(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: this.secret, algorithm: 'HS256', expiresIn: this.ttlSeconds },
    );
  }

  async verify(token: string): Promise<AccessTokenVerification> {
    try {
      // Algorithm pinned: never trust the token header (blocks `alg: none` and algorithm confusion).
      const payload: unknown = await this.jwt.verifyAsync(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      const claims = claimsSchema.safeParse(payload);
      return claims.success ? { ok: true, claims: claims.data } : { ok: false, reason: 'invalid' };
    } catch (error) {
      // Distinguish expiry (client should refresh) from tampering (client should not retry).
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      return { ok: false, reason: expired ? 'expired' : 'invalid' };
    }
  }
}
