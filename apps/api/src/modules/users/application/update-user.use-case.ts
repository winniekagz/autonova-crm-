import { Injectable } from '@nestjs/common';
import type { UserDto } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { userNotFound } from '../domain/errors.js';
import { UsersRepository } from '../infrastructure/users.repository.js';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  /** Profile update. Only the display name is editable: email is the sign-in identity, roles and status have their own audited actions. */
  async execute(input: {
    actorId: string;
    userId: string;
    fullName: string;
    requestId?: string | undefined;
  }): Promise<UserDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.users.findById(input.userId, tx);
      if (!before) throw userNotFound();
      if (before.fullName === input.fullName) return before; // no change, no audit noise

      const after = await this.users.updateFullName(tx, input.userId, input.fullName);
      await this.audit.record(tx, {
        action: 'user.updated',
        entityType: 'user',
        entityId: after.id,
        actorUserId: input.actorId,
        oldValues: { fullName: before.fullName },
        newValues: { fullName: after.fullName },
        requestId: input.requestId,
      });
      return after;
    });
  }
}
