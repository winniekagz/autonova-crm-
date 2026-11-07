import { Injectable } from '@nestjs/common';
import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { UserDto } from '@autonova/contracts';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Db } from '../../auth/infrastructure/auth.repository.js';
import { unknownRole } from '../domain/errors.js';
import type { TargetState } from '../domain/user-administration.js';

/**
 * The ONLY columns ever read for user administration. `passwordHash` is deliberately absent, so a
 * credential cannot reach a DTO, a log line or an audit snapshot by accident.
 */
const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    status: row.status,
    roles: row.roles.map((r) => r.role.key).sort(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UserListFilter {
  q?: string | undefined;
  status?: UserStatus | undefined;
  role?: string | undefined;
  page: number;
  pageSize: number;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: UserListFilter): Promise<{ items: UserDto[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.role ? { roles: { some: { role: { key: filter.role } } } } : {}),
      ...(filter.q
        ? {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' } },
              { fullName: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        // id breaks ties so pages are stable when several users share a creation instant.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toUserDto), total };
  }

  async findById(id: string, db: Db | PrismaService = this.prisma): Promise<UserDto | null> {
    const row = await db.user.findUnique({ where: { id }, select: USER_SELECT });
    return row ? toUserDto(row) : null;
  }

  /** Minimal state the domain rules need. */
  async findTargetState(db: Db, id: string): Promise<TargetState | null> {
    const row = await db.user.findUnique({
      where: { id },
      select: { id: true, status: true, roles: { select: { role: { select: { key: true } } } } },
    });
    return row ? { id: row.id, status: row.status, roles: row.roles.map((r) => r.role.key) } : null;
  }

  countOtherActiveDirectors(db: Db, excludeUserId: string): Promise<number> {
    return db.user.count({
      where: {
        id: { not: excludeUserId },
        status: UserStatus.Active,
        roles: { some: { role: { key: SystemRoleKey.Director } } },
      },
    });
  }

  /**
   * Maps role keys to ids, in the same order. Throws `unknownRole` for any key that is not a real
   * role, so an unvalidated identifier can never reach an INSERT.
   */
  async resolveRoleIds(db: Db, keys: readonly string[]): Promise<string[]> {
    const rows = await db.role.findMany({
      where: { key: { in: [...keys] } },
      select: { id: true, key: true },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    return keys.map((key) => {
      const id = byKey.get(key);
      if (id === undefined) throw unknownRole(key);
      return id;
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      select: { key: true, name: true, description: true },
      orderBy: { key: 'asc' },
    });
  }

  async createInvitedUser(
    db: Db,
    data: { email: string; fullName: string; roleIds: string[] },
  ): Promise<UserDto> {
    // Persistence data is constructed field by field: no request object is ever spread in.
    const row = await db.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        status: UserStatus.Invited,
        passwordHash: null,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
      },
      select: USER_SELECT,
    });
    return toUserDto(row);
  }

  async updateFullName(db: Db, id: string, fullName: string): Promise<UserDto> {
    const row = await db.user.update({ where: { id }, data: { fullName }, select: USER_SELECT });
    return toUserDto(row);
  }

  async replaceRoles(db: Db, userId: string, roleIds: string[]): Promise<void> {
    await db.userRole.deleteMany({ where: { userId, roleId: { notIn: roleIds } } });
    await db.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
    // Touch the user so `updatedAt` reflects a role change too.
    await db.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
  }

  async markDisabled(db: Db, id: string): Promise<UserDto> {
    const row = await db.user.update({
      where: { id },
      data: { status: UserStatus.Disabled },
      select: USER_SELECT,
    });
    return toUserDto(row);
  }
}
