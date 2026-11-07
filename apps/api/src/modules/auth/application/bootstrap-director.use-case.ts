import { Injectable } from '@nestjs/common';
import { SystemRoleKey, UserStatus } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService, snapshot } from '../../audit/audit.service.js';
import { lockDirectorSet } from '../infrastructure/director-set-lock.js';
import { PasswordHasher } from './password-hasher.js';

export class DirectorAlreadyExistsError extends Error {
  constructor() {
    super('An active Director already exists; bootstrap is only for the very first account.');
  }
}

export class RoleNotSeededError extends Error {
  constructor() {
    super('The "director" role does not exist. Run `pnpm db:seed` first.');
  }
}

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super('A user with this email already exists but is not an active Director.');
  }
}

export interface BootstrapDirectorInput {
  email: string;
  fullName: string;
  password: string;
}

/**
 * Creates the first Director. Invoked only by the CLI (`src/cli/bootstrap-director.ts`) — there is
 * deliberately no HTTP endpoint, so nobody can claim the system over the network.
 *
 * Refuses to run when an active Director exists. The check, the insert and the audit row share one
 * transaction guarded by an advisory lock, so two concurrent runs cannot both succeed.
 *
 * TODO(Phase 1, MFA flow): the new Director must be forced to enrol TOTP on first login (docs/06).
 * That is enforced by the login flow, which derives the requirement from the Director role.
 */
@Injectable()
export class BootstrapDirectorUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: BootstrapDirectorInput): Promise<{ userId: string }> {
    // Hash before opening the transaction: it is deliberately slow and must not hold the lock.
    const passwordHash = await this.hasher.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      await lockDirectorSet(tx);

      const role = await tx.role.findUnique({ where: { key: SystemRoleKey.Director } });
      if (!role) throw new RoleNotSeededError();

      const existingDirector = await tx.userRole.findFirst({
        where: { roleId: role.id, user: { status: UserStatus.Active } },
        select: { userId: true },
      });
      if (existingDirector) throw new DirectorAlreadyExistsError();

      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new EmailAlreadyUsedError();
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          status: UserStatus.Active,
          roles: { create: { roleId: role.id } },
        },
      });

      await this.audit.record(tx, {
        action: 'user.bootstrap_director',
        entityType: 'user',
        entityId: user.id,
        actorUserId: null,
        newValues: { ...snapshot(user, ['email', 'fullName', 'status']), role: role.key },
      });

      return { userId: user.id };
    });
  }
}
