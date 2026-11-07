import { Injectable } from '@nestjs/common';
import type { UserDto } from '@autonova/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { emailTaken } from '../domain/errors.js';
import { normalizeRoles } from '../domain/user-administration.js';
import { UsersRepository } from '../infrastructure/users.repository.js';
import { userAuditSnapshot } from './user-audit.js';

export interface CreateUserInput {
  actorId: string;
  requestId?: string | undefined;
  email: string;
  fullName: string;
  roles: readonly string[];
}

/**
 * Invites a new internal user. The account is created INVITED with no password: the person sets
 * one through the invitation flow (not yet built). Nobody, including a Director, chooses another
 * person's password or status here.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreateUserInput): Promise<UserDto> {
    const roles = normalizeRoles(input.roles);
    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      // The unique index is the authority on duplicates; a pre-check would race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }
  }
}
