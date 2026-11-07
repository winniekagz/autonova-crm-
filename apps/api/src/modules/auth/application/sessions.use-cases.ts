import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionDto } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuthRepository } from '../infrastructure/auth.repository.js';

export const SESSION_NOT_FOUND = {
  code: 'SESSION_NOT_FOUND',
  message: 'Session not found',
} as const;

@Injectable()
export class ListSessionsUseCase {
  constructor(private readonly repository: AuthRepository) {}

  /** Only the caller's own live sessions; the user id comes from the authenticated request. */
  async execute(input: { userId: string; currentSessionId: string }): Promise<SessionDto[]> {
    const rows = await this.repository.listLiveSessions(input.userId, new Date());
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.id === input.currentSessionId,
      ip: row.ip,
      userAgent: row.userAgent,
    }));
  }
}

@Injectable()
export class RevokeSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Revokes one of the caller's own sessions. A session that does not exist, belongs to someone else,
   * or is already over all answer the same 404, so ids of other users' sessions cannot be probed.
   * Revoking the session revokes every refresh token it owns (they are checked through the session).
   */
  async execute(input: {
    userId: string;
    sessionId: string;
    currentSessionId: string;
    requestId?: string;
  }): Promise<{ current: boolean }> {
    const current = input.sessionId === input.currentSessionId;
    await this.prisma.$transaction(async (tx) => {
      const revoked = await this.repository.revokeOwnedSession(tx, {
        userId: input.userId,
        sessionId: input.sessionId,
        reason: 'revoked_by_user',
        now: new Date(),
      });
      if (!revoked) throw new NotFoundException(SESSION_NOT_FOUND);
      await this.audit.recordSecurityIn(tx, {
        action: 'auth.session_revoked',
        entityType: 'session',
        entityId: input.sessionId,
        actorUserId: input.userId,
        newValues: { currentSession: current },
        requestId: input.requestId,
      });
    });
    return { current };
  }
}
