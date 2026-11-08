import { Injectable } from '@nestjs/common';
import type { UserDto } from '@autonova/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { emailTaken } from '../domain/errors.js';
import { normalizeRoles } from '../domain/user-administration.js';
import { UsersRepository } from '../infrastructure/users.repository.js';
import { userAuditSnapshot } from './user-audit.js';
import { UserInvitationsService } from './user-invitations.service.js';

export interface CreateUserInput {
  actorId: string;
  requestId?: string | undefined;
  email: string;
  fullName: string;
  roles: readonly string[];
}

/**
 * Creates an INVITED account and emails its owner a one-time link to set their own password.
 * Nobody, including a Director, chooses another person's password or status here.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    private readonly invitations: UserInvitationsService,
  ) {}

  async execute(input: CreateUserInput): Promise<UserDto> {
    const roles = normalizeRoles(input.roles);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const roleIds = await this.users.resolveRoleIds(tx, roles);
        const created = await this.users.createInvitedUser(tx, {
          email: input.email,
          fullName: input.fullName,
          roleIds,
        });
        await this.audit.record(tx, {
          action: 'user.created',
          entityType: 'user',
          entityId: created.id,
          actorUserId: input.actorId,
          newValues: userAuditSnapshot(created),
          requestId: input.requestId,
        });
        return created;
      });
      await this.invitations.issueAndSend({
        userId: created.id,
        email: created.email,
        fullName: created.fullName,
        actorUserId: input.actorId,
        requestId: input.requestId,
      });
      return created;
    } catch (error) {
      // The unique index is the authority on duplicates; a pre-check would race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }
  }
}
