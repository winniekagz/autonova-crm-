import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { SessionContextRecord } from '../domain/session-authentication.js';

export type Db = Prisma.TransactionClient;

export interface LoginCandidate {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string | null;
  status: string;
  roleKeys: string[];
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything needed to authenticate one request, in a single round trip: the session, its owner,
   * and the owner's CURRENT roles and permissions. Only selected fields are loaded.
   */
  async loadSessionContext(sessionId: string): Promise<SessionContextRecord | null> {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        mfaVerifiedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            roles: {
              select: {
                role: {
                  select: {
                    key: true,
                    permissions: { select: { permission: { select: { key: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    return {
      session: {
        id: row.id,
        userId: row.userId,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        mfaVerifiedAt: row.mfaVerifiedAt,
      },
      user: {
        id: row.user.id,
        email: row.user.email,
        fullName: row.user.fullName,
        status: row.user.status,
        roles: row.user.roles.map((ur) => ({
          key: ur.role.key,
          permissions: ur.role.permissions.map((rp) => rp.permission.key),
        })),
      },
    };
  }

  async findLoginCandidate(email: string): Promise<LoginCandidate | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true,
        status: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      status: user.status,
      roleKeys: user.roles.map((ur) => ur.role.key),
    };
  }

  createSession(
    db: Db,
    data: { userId: string; expiresAt: Date; ip: string | null; userAgent: string | null },
  ): Promise<{ id: string }> {
    return db.session.create({ data, select: { id: true } });
  }

  /** Revokes every live session of a user (disable, role removal). Returns how many were revoked. */
  async revokeAllSessionsForUser(
    db: Db,
    userId: string,
    reason: string,
    now: Date,
  ): Promise<number> {
    const { count } = await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    return count;
  }

  async revokeSession(db: Db, sessionId: string, reason: string, now: Date): Promise<boolean> {
    const { count } = await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    return count === 1;
  }
}
