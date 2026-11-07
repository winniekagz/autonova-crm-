import { Injectable } from '@nestjs/common';
import type { AccessTokenClaims } from './access-token.service.js';
import {
  authenticateSession,
  type AuthenticationResult,
} from '../domain/session-authentication.js';
import { AuthRepository } from '../infrastructure/auth.repository.js';

/** Runs on every protected request: loads the session context and applies the domain rule. */
@Injectable()
export class SessionAuthenticator {
  constructor(private readonly repository: AuthRepository) {}

  async authenticate(
    claims: Pick<AccessTokenClaims, 'sub' | 'sid'>,
    now: Date = new Date(),
  ): Promise<AuthenticationResult> {
    const record = await this.repository.loadSessionContext(claims.sid);
    return authenticateSession(record, claims, now);
  }
}
