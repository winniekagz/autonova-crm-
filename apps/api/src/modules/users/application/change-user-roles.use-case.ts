import { Injectable } from '@nestjs/common';
import type { UserDto } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuthRepository } from '../../auth/infrastructure/auth.repository.js';
import { lockDirectorSet } from '../../auth/infrastructure/director-set-lock.js';
import { ruleViolation, userNotFound } from '../domain/errors.js';
import { checkRoleChange, normalizeRoles } from '../domain/user-administration.js';
import { UsersRepository } from '../infrastructure/users.repository.js';

@Injectable()
export class ChangeUserRolesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly auth: AuthRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Replaces a user's role set. Takes effect on the target's next request because the guard loads
   * roles from the database every time. If a role is REMOVED, the target's sessions are revoked as
   * well (docs/06 "Session revocation"): losing authority must not wait for token expiry, and a
   * Director who loses the role must not keep a verified-MFA session.
   */
  async execute(input: {
    actorId: string;
    userId: string;
    roles: readonly string[];
    reason?: string | undefined;
    requestId?: string | undefined;
  }): Promise<UserDto> {
    const nextRoles = normalizeRoles(input.roles);

    return this.prisma.$transaction(async (tx) => {
      await lockDirectorSet(tx);

      const target = await this.users.findTargetState(tx, input.userId);
      if (!target) throw userNotFound();

      const decision = checkRoleChange({
        actorId: input.actorId,
        target,
        nextRoles,
        otherActiveDirectors: await this.users.countOtherActiveDirectors(tx, input.userId),
      });
      if (!decision.ok) throw ruleViolation(decision.violation);

      const before = await this.users.findById(input.userId, tx);
      if (!before) throw userNotFound();
      if (before.roles.join(',') === nextRoles.join(',')) return before; // unchanged: no audit noise

      const roleIds = await this.users.resolveRoleIds(tx, nextRoles);
      await this.users.replaceRoles(tx, input.userId, roleIds);
      const after = await this.users.findById(input.userId, tx);
      if (!after) throw userNotFound();

      const removed = before.roles.filter((role) => !nextRoles.includes(role));
      const revoked =
        removed.length > 0
          ? await this.auth.revokeAllSessionsForUser(tx, input.userId, 'roles_reduced', new Date())
          : 0;

      await this.audit.record(tx, {
        action: 'user.roles_changed',
        entityType: 'user',
        entityId: input.userId,
        actorUserId: input.actorId,
        oldValues: { roles: before.roles.join(',') },
        newValues: { roles: after.roles.join(','), sessionsRevoked: revoked },
        reason: input.reason,
        requestId: input.requestId,
      });
      return after;
    });
  }
}
