import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuthRepository } from '../infrastructure/auth.repository.js';

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Revokes the caller's current session, and with it every refresh token of that session.
   * Idempotent: logging out an already-revoked session changes and audits nothing.
   */
  async execute(input: { userId: string; sessionId: string; requestId?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await this.repository.revokeSession(
        tx,
        input.sessionId,
        'logout',
        new Date(),
      );
      if (!revoked) return;
      await this.audit.recordSecurityIn(tx, {
        action: 'auth.logout',
        entityType: 'session',
        entityId: input.sessionId,
        actorUserId: input.userId,
        requestId: input.requestId,
      });
    });
  }
}
