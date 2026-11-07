import { Injectable } from '@nestjs/common';
import type { RefreshResponse } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { hashRefreshToken } from '../domain/refresh-token.js';
import { authenticateSession } from '../domain/session-authentication.js';
import { AuthRepository } from '../infrastructure/auth.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { RefreshTokenService, type IssuedRefreshToken } from './refresh-token.service.js';

export type RefreshRejection =
  'unknown_token' | 'token_expired' | 'replay_detected' | 'session_invalid';

export type RefreshOutcome =
  | { ok: true; response: RefreshResponse; refreshToken: IssuedRefreshToken }
  | { ok: false; reason: RefreshRejection };

type TransactionResult =
  | {
      kind: 'rotated';
      userId: string;
      sessionId: string;
      mfaRequired: boolean;
      refresh: IssuedRefreshToken;
    }
  | { kind: 'rejected'; reason: RefreshRejection };

/**
 * Exchanges a refresh token for a new access token and a replacement refresh token.
 *
 * `POST /auth/refresh` is @Public() (it has no access token to present), so THIS class is its whole
 * authentication: it does not trust anything but the opaque token's hash, and it re-checks the
 * session and the user against the database on every call.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly refreshTokens: RefreshTokenService,
    private readonly tokens: AccessTokenService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: {
    rawToken: string;
    ip: string | null;
    requestId?: string;
  }): Promise<RefreshOutcome> {
    const tokenHash = hashRefreshToken(input.rawToken);
    const now = new Date();

    // Everything below commits or rolls back as one: consuming the token, issuing its successor,
    // revoking on replay and the audit rows describing them.
    const result = await this.prisma.$transaction(async (tx): Promise<TransactionResult> => {
      // The atomic step. A conditional UPDATE: of any number of concurrent requests carrying the same
      // token, exactly one matches `used_at IS NULL` and gets the session id; the rest get null.
      const consumed = await this.repository.consumeRefreshToken(tx, tokenHash, now);

      if (!consumed) {
        const known = await this.repository.inspectRefreshToken(tx, tokenHash);
        if (!known) return { kind: 'rejected', reason: 'unknown_token' };
        if (!known.used) return { kind: 'rejected', reason: 'token_expired' };

        // A token that was already exchanged is being presented again: either a thief or a stale
        // copy. We cannot tell which, so the whole session ends and the user must sign in again.
        const revoked = await this.repository.revokeSession(
          tx,
          known.sessionId,
          'refresh_reuse',
          now,
        );
        await this.audit.recordSecurityIn(tx, {
          action: 'auth.refresh_reuse_detected',
          entityType: 'session',
          entityId: known.sessionId,
          actorUserId: known.userId,
          newValues: { sessionRevoked: revoked, ip: input.ip },
          requestId: input.requestId,
        });
        return { kind: 'rejected', reason: 'replay_detected' };
      }

      const record = await this.repository.loadSessionContext(consumed.sessionId, tx);
      const authentication = authenticateSession(
        record,
        { sub: record?.user.id ?? '', sid: consumed.sessionId },
        now,
      );
      if (!authentication.ok || !record) return { kind: 'rejected', reason: 'session_invalid' };

      // `mfa_verified_at` is deliberately untouched: a refresh can never upgrade a session.
      const refresh = await this.refreshTokens.issue(tx, {
        sessionId: record.session.id,
        sessionExpiresAt: record.session.expiresAt,
        now,
      });
      await this.repository.pruneSpentRefreshTokens(tx, record.session.id, now);
      await this.audit.recordSecurityIn(tx, {
        action: 'auth.refresh_succeeded',
        entityType: 'session',
        entityId: record.session.id,
        actorUserId: record.user.id,
        newValues: { ip: input.ip },
        requestId: input.requestId,
      });
      return {
        kind: 'rotated',
        userId: record.user.id,
        sessionId: record.session.id,
        mfaRequired: authentication.user.mfaRequired,
        refresh,
      };
    });

    if (result.kind === 'rejected') return { ok: false, reason: result.reason };

    return {
      ok: true,
      refreshToken: result.refresh,
      response: {
        accessToken: await this.tokens.sign(result.userId, result.sessionId),
        tokenType: 'Bearer',
        expiresIn: this.tokens.expiresInSeconds,
        mfaRequired: result.mfaRequired,
      },
    };
  }
}
