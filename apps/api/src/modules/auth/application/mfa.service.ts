import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import { decryptSecret, encryptSecret, recoveryCode, recoveryHash } from '../domain/mfa-crypto.js';

const OTP_REJECTED = {
  code: 'MFA_CODE_INVALID',
  message: 'The verification code was not accepted.',
};
const RECOVERY_REJECTED = {
  code: 'MFA_RECOVERY_INVALID',
  message: 'The recovery code was not accepted.',
};
const ENROLLMENT_CONFLICT = {
  code: 'MFA_ALREADY_ENROLLED',
  message: 'MFA is already enrolled. Use a recovery code or contact another Director.',
};
const LOCK_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const STEP_SECONDS = 30;
const issuer = 'Autonova CRM';

/** One definition of the lockout answer, so the early check and the final failure cannot drift. */
function mfaRateLimited(): HttpException {
  return new HttpException(
    { code: 'MFA_RATE_LIMITED', message: 'Too many verification attempts. Try again later.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function requireDirector(user: AuthenticatedUser): void {
  if (!user.mfaRequired || !user.roles.includes('director')) {
    throw new ForbiddenException({ code: 'MFA_DIRECTOR_ONLY', message: 'MFA is not available.' });
  }
}

@Injectable()
export class AuthMfaService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.key = Buffer.from(config.get('MFA_ENCRYPTION_KEY', { infer: true }), 'base64');
    if (this.key.length !== 32)
      throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  async status(user: AuthenticatedUser): Promise<{ enrolled: boolean }> {
    requireDirector(user);
    const value = await this.prisma.userMfa.findUnique({
      where: { userId: user.id },
      select: { enrolledAt: true },
    });
    return { enrolled: value?.enrolledAt !== null && value?.enrolledAt !== undefined };
  }

  async beginEnrollment(user: AuthenticatedUser): Promise<{ secret: string; uri: string }> {
    requireDirector(user);
    const existing = await this.prisma.userMfa.findUnique({ where: { userId: user.id } });
    if (existing?.enrolledAt) throw new ConflictException(ENROLLMENT_CONFLICT);

    const secret = generateSecret();
    const encrypted = encryptSecret(secret, this.key);
    await this.prisma.userMfa.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        failedAttempts: 0,
      },
      update: {
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.audit.recordSecurity({
      action: 'auth.mfa_enrollment_started',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
    });
    return { secret, uri: generateURI({ issuer, label: user.email, secret }) };
  }

  async confirmEnrollment(input: {
    user: AuthenticatedUser;
    code: string;
    requestId?: string;
  }): Promise<{ recoveryCodes: string[] }> {
    requireDirector(input.user);
    const now = new Date();
    const row = await this.prisma.userMfa.findUnique({ where: { userId: input.user.id } });
    if (!row || row.enrolledAt || !row.secretCiphertext || !row.secretIv || !row.secretTag) {
      throw new UnauthorizedException(OTP_REJECTED);
    }
    await this.assertNotLocked(row.lockedUntil, now);
    const secret = decryptSecret(
      { ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag },
      this.key,
    );
    const check = await verify({ secret, token: input.code, epochTolerance: STEP_SECONDS });
    if (!check.valid)
      return this.failed(input.user.id, 'auth.mfa_enrollment_failed', input.requestId);
    const step = BigInt(Math.floor(now.getTime() / 1000 / STEP_SECONDS) + (check.delta ?? 0));
    const codes = Array.from({ length: 10 }, recoveryCode);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userMfa.updateMany({
        where: { userId: input.user.id, enrolledAt: null, lastAcceptedStep: null },
        data: { enrolledAt: now, lastAcceptedStep: step, failedAttempts: 0, lockedUntil: null },
      });
      if (updated.count !== 1) throw new UnauthorizedException(OTP_REJECTED);
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({ userId: input.user.id, codeHash: recoveryHash(code) })),
      });
      const session = await tx.session.updateMany({
        where: {
          id: input.user.sessionId,
          userId: input.user.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { mfaVerifiedAt: now },
      });
      if (session.count !== 1) throw new UnauthorizedException(OTP_REJECTED);
      await this.audit.recordSecurityIn(tx, {
        action: 'auth.mfa_enrolled',
        entityType: 'user',
        entityId: input.user.id,
        actorUserId: input.user.id,
        newValues: { mfaEnrolled: true },
        requestId: input.requestId,
      });
    });
    return { recoveryCodes: codes };
  }

  async verifyCode(input: {
    user: AuthenticatedUser;
    code: string;
    requestId?: string;
  }): Promise<void> {
    requireDirector(input.user);
    const now = new Date();
    const row = await this.prisma.userMfa.findUnique({ where: { userId: input.user.id } });
    if (!row?.enrolledAt || !row.secretCiphertext || !row.secretIv || !row.secretTag) {
      throw new UnauthorizedException(OTP_REJECTED);
    }
    await this.assertNotLocked(row.lockedUntil, now);
    const secret = decryptSecret(
      { ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag },
      this.key,
    );
    const check = await verify({
      secret,
      token: input.code,
      epochTolerance: STEP_SECONDS,
      ...(row.lastAcceptedStep === null ? {} : { afterTimeStep: Number(row.lastAcceptedStep) }),
    });
    if (!check.valid)
      return this.failed(input.user.id, 'auth.mfa_verification_failed', input.requestId);
    const step = BigInt(Math.floor(now.getTime() / 1000 / STEP_SECONDS) + (check.delta ?? 0));
    await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.userMfa.updateMany({
        where: {
          userId: input.user.id,
          enrolledAt: { not: null },
          OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: step } }],
        },
        data: { lastAcceptedStep: step, failedAttempts: 0, lockedUntil: null },
      });
      if (advanced.count !== 1) throw new UnauthorizedException(OTP_REJECTED);
      const session = await tx.session.updateMany({
        where: {
          id: input.user.sessionId,
          userId: input.user.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { mfaVerifiedAt: now },
      });
      if (session.count !== 1) throw new UnauthorizedException(OTP_REJECTED);
      await this.audit.recordSecurityIn(tx, {
        action: 'auth.mfa_verified',
        entityType: 'session',
        entityId: input.user.sessionId,
        actorUserId: input.user.id,
        newValues: { mfaVerified: true },
        requestId: input.requestId,
      });
    });
  }

  async recover(input: {
    user: AuthenticatedUser;
    code: string;
    requestId?: string;
  }): Promise<void> {
    requireDirector(input.user);
    const now = new Date();
    const row = await this.prisma.userMfa.findUnique({
      where: { userId: input.user.id },
      select: { failedAttempts: true, lockedUntil: true, enrolledAt: true },
    });
    if (!row?.enrolledAt) throw new UnauthorizedException(RECOVERY_REJECTED);
    await this.assertNotLocked(row.lockedUntil, now);
    await this.prisma
      .$transaction(async (tx) => {
        const consumed = await tx.mfaRecoveryCode.updateMany({
          where: { userId: input.user.id, codeHash: recoveryHash(input.code), usedAt: null },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new RecoveryFailure();
        await tx.mfaRecoveryCode.updateMany({
          where: { userId: input.user.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.userMfa.update({
          where: { userId: input.user.id },
          data: {
            secretCiphertext: null,
            secretIv: null,
            secretTag: null,
            enrolledAt: null,
            lastAcceptedStep: null,
            failedAttempts: 0,
            lockedUntil: null,
          },
        });
        // A recovery code grants re-enrollment only; it never upgrades any session.
        await tx.session.updateMany({
          where: { userId: input.user.id },
          data: { mfaVerifiedAt: null },
        });
        await this.audit.recordSecurityIn(tx, {
          action: 'auth.mfa_recovery_used',
          entityType: 'user',
          entityId: input.user.id,
          actorUserId: input.user.id,
          newValues: { reEnrollmentRequired: true },
          requestId: input.requestId,
        });
      })
      .catch(async (error: unknown) => {
        if (!(error instanceof RecoveryFailure)) throw error;
        await this.failed(input.user.id, 'auth.mfa_recovery_failed', input.requestId);
      });
  }

  private async assertNotLocked(lockedUntil: Date | null, now: Date): Promise<void> {
    if (lockedUntil && lockedUntil > now) {
      throw mfaRateLimited();
    }
  }

  private async failed(userId: string, action: string, requestId?: string): Promise<never> {
    const now = new Date();
    await this.prisma.userMfa.updateMany({
      where: { userId, lockedUntil: { lte: now } },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const current = await this.prisma.userMfa.update({
      where: { userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    const lockedUntil =
      current.failedAttempts >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null;
    if (lockedUntil) {
      await this.prisma.userMfa.update({ where: { userId }, data: { lockedUntil } });
    }
    await this.audit.recordSecurity({
      action: lockedUntil ? 'auth.mfa_locked' : action,
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      newValues: { failedAttempts: current.failedAttempts, locked: Boolean(lockedUntil) },
      requestId,
    });
    if (lockedUntil) {
      throw mfaRateLimited();
    }
    throw new UnauthorizedException(action.includes('recovery') ? RECOVERY_REJECTED : OTP_REJECTED);
  }
}

class RecoveryFailure extends Error {}
