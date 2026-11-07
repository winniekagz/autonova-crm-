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

  /** Revokes the caller's current session. Idempotent: logging out twice is not an error. */
  async execute(input: { userId: string; sessionId: string; requestId?: string }): Promise<void> {
    const revoked = await this.repository.revokeSession(
      this.prisma,
      input.sessionId,
      'logout',
      new Date(),
    );
    if (revoked) {
      await this.audit.recordSecurity({
        action: 'auth.logout',
        entityType: 'session',
        entityId: input.sessionId,
        actorUserId: input.userId,
        requestId: input.requestId,
      });
    }
  }
}
