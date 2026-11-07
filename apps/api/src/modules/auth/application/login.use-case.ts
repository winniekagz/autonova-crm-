import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@autonova/enums';
import type { LoginResponse } from '@autonova/contracts';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { ROLES_REQUIRING_MFA } from '../domain/session-authentication.js';
import { AuthRepository } from '../infrastructure/auth.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshTokenService, type IssuedRefreshToken } from './refresh-token.service.js';

export interface LoginInput {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
  requestId?: string;
}

export interface LoginResult {
  body: LoginResponse;
  /** For the HttpOnly cookie only; it must never be placed in the response body. */
  refreshToken: IssuedRefreshToken;
}

/** One response for every failure cause: wrong password, unknown email, invited or disabled user. */
export const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
} as const;

@Injectable()
export class LoginUseCase {
  private dummyHash: Promise<string> | undefined;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.sessionTtlMs = config.get('SESSION_ABSOLUTE_TTL_SECONDS', { infer: true }) * 1000;
  }

  async execute(input: LoginInput): Promise<LoginResult> {
    const candidate = await this.repository.findLoginCandidate(input.email);

    // Always perform one password verification — against a throwaway hash when there is no usable
    // account — so response time does not reveal whether the email exists.
    const hashToCheck = candidate?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.hasher.verify(hashToCheck, input.password);

    const failure = !candidate
      ? 'unknown_user'
      : candidate.status !== UserStatus.Active || !candidate.passwordHash
        ? 'account_not_active'
        : !passwordMatches
          ? 'bad_password'
          : null;

    if (failure || !candidate) {
      await this.audit.recordSecurity({
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: candidate?.id ?? 'unknown',
        actorUserId: null,
        // No email/password: an attempted "email" can be a mistyped password. IP is needed for response.
        newValues: { reason: failure ?? 'unknown_user', ip: input.ip },
        requestId: input.requestId,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();
    const upgradedHash =
      candidate.passwordHash && this.hasher.needsRehash(candidate.passwordHash)
        ? await this.hasher.hash(input.password)
        : null;

    const sessionExpiresAt = new Date(now.getTime() + this.sessionTtlMs);
    const { session, refreshToken } = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.createSession(tx, {
        userId: candidate.id,
        expiresAt: sessionExpiresAt,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      });
      const issued = await this.refreshTokens.issue(tx, {
        sessionId: created.id,
        sessionExpiresAt,
        now,
      });
      await tx.user.update({
        where: { id: candidate.id },
        data: { lastLoginAt: now, ...(upgradedHash ? { passwordHash: upgradedHash } : {}) },
      });
      return { session: created, refreshToken: issued };
    });

    const mfaRequired = candidate.roleKeys.some((role) => ROLES_REQUIRING_MFA.includes(role));
    await this.audit.recordSecurity({
      action: 'auth.login_succeeded',
      entityType: 'session',
      entityId: session.id,
      actorUserId: candidate.id,
      newValues: { mfaRequired, ip: input.ip },
      requestId: input.requestId,
    });

    return {
      body: {
        accessToken: await this.tokens.sign(candidate.id, session.id),
        tokenType: 'Bearer',
        expiresIn: this.tokens.expiresInSeconds,
        mfaRequired,
      },
      refreshToken,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(`dummy-${Math.random()}-${Date.now()}`);
    return this.dummyHash;
  }
}
