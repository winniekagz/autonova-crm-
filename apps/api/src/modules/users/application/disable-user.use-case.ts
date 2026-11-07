import { Injectable } from '@nestjs/common';
import type { UserDto } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuthRepository } from '../../auth/infrastructure/auth.repository.js';
import { lockDirectorSet } from '../../auth/infrastructure/director-set-lock.js';
import { ruleViolation, userNotFound } from '../domain/errors.js';
import { checkDisable } from '../domain/user-administration.js';
import { UsersRepository } from '../infrastructure/users.repository.js';

@Injectable()
export class DisableUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly auth: AuthRepository,
    private readonly audit: AuditService,
  ) {}

  /** Disables the account (never deletes) and revokes every live session in the same transaction. */
  async execute(input: {
    actorId: string;
    userId: string;
    reason?: string | undefined;
    requestId?: string | undefined;
  }): Promise<UserDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockDirectorSet(tx);

      const target = await this.users.findTargetState(tx, input.userId);
      if (!target) throw userNotFound();

      const decision = checkDisable({
        actorId: input.actorId,
        target,
        otherActiveDirectors: await this.users.countOtherActiveDirectors(tx, input.userId),
      });
      if (!decision.ok) throw ruleViolation(decision.violation);

      const disabled = await this.users.markDisabled(tx, input.userId);
      const revoked = await this.auth.revokeAllSessionsForUser(
        tx,
        input.userId,
        'user_disabled',
        new Date(),
      );
      await this.audit.record(tx, {
        action: 'user.disabled',
        entityType: 'user',
        entityId: input.userId,
        actorUserId: input.actorId,
        oldValues: { status: target.status },
        newValues: { status: disabled.status, sessionsRevoked: revoked },
        reason: input.reason,
        requestId: input.requestId,
      });
      return disabled;
    });
  }
}
