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

export interface LiveSessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything needed to authenticate one request, in a single round trip: the session, its owner,
   * and the owner's CURRENT roles and permissions. Only selected fields are loaded.
   */
  async loadSessionContext(
    sessionId: string,
    db: Db = this.prisma,
  ): Promise<SessionContextRecord | null> {
    const row = await db.session.findUnique({
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

  /**
   * Revokes a session only if it belongs to `userId` and is still live. The ownership check is part
   * of the UPDATE's WHERE clause, so there is no window between "is it mine?" and "revoke it".
   */
  async revokeOwnedSession(
    db: Db,
    input: { userId: string; sessionId: string; reason: string; now: Date },
  ): Promise<boolean> {
    const { count } = await db.session.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: input.now },
      },
      data: { revokedAt: input.now, revokedReason: input.reason },
    });
    return count === 1;
  }

  /** The user's live sessions, newest first. Selects only fields that are safe to show the owner. */
  listLiveSessions(userId: string, now: Date): Promise<LiveSessionRow[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, expiresAt: true, ip: true, userAgent: true },
    });
  }

  createRefreshToken(
    db: Db,
    data: { sessionId: string; tokenHash: string; createdAt: Date; expiresAt: Date },
  ): Promise<unknown> {
    return db.refreshToken.create({ data, select: { id: true } });
  }

  /**
   * Consumes a refresh token: the single atomic step that makes rotation safe. It is one conditional
   * UPDATE, so under PostgreSQL's default READ COMMITTED isolation concurrent callers queue on the
   * row lock; the loser re-evaluates `used_at IS NULL` after the winner commits, matches nothing,
   * and gets `null`. Only the winner receives the session id.
   */
  async consumeRefreshToken(
    db: Db,
    tokenHash: string,
    now: Date,
  ): Promise<{ sessionId: string } | null> {
    const { count } = await db.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return null;
    // We hold the row lock until commit, so this read cannot see anything but our own update.
    return db.refreshToken.findUniqueOrThrow({ where: { tokenHash }, select: { sessionId: true } });
  }

  /** Why a token could not be consumed: it does not exist, was already used, or has expired. */
  async inspectRefreshToken(
    db: Db,
    tokenHash: string,
  ): Promise<{ sessionId: string; userId: string; used: boolean } | null> {
    const row = await db.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true, usedAt: true, session: { select: { userId: true } } },
    });
    return row
      ? { sessionId: row.sessionId, userId: row.session.userId, used: row.usedAt !== null }
      : null;
  }

  /**
   * Housekeeping on rotation: drops this session's tokens that were already used AND have expired.
   * Such a token could not be exchanged anyway; unexpired used tokens stay so replay is still seen.
   */
  async pruneSpentRefreshTokens(db: Db, sessionId: string, now: Date): Promise<void> {
    await db.refreshToken.deleteMany({
      where: { sessionId, usedAt: { not: null }, expiresAt: { lt: now } },
    });
  }
}
