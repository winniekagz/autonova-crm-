import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { EmailService } from '../../email/email.service.js';
import { PasswordHasher } from '../../auth/application/password-hasher.js';

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const INVALID_INVITATION = {
  code: 'INVITATION_INVALID',
  message: 'This invitation is invalid, expired, or has already been used.',
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class UserInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly passwords: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async resend(input: { userId: string; actorUserId: string; requestId?: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, fullName: true, status: true },
    });
    if (!user || user.status !== 'INVITED') {
      throw new NotFoundException({
        code: 'INVITATION_NOT_AVAILABLE',
        message: 'An invitation cannot be sent for this account.',
      });
    }
    await this.issueAndSend({ ...input, ...user });
  }

  async issueAndSend(input: {
    userId: string;
    email: string;
    fullName: string;
    actorUserId: string;
    requestId?: string;
  }): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.userInvitation.updateMany({
        where: { userId: input.userId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.userInvitation.create({
        data: {
          userId: input.userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        },
      });
      await this.audit.record(tx, {
        action: 'user.invitation_sent',
        entityType: 'user',
        entityId: input.userId,
        actorUserId: input.actorUserId,
        newValues: { expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString() },
        requestId: input.requestId,
      });
    });

    try {
      await this.email.sendInvitation({ email: input.email, fullName: input.fullName, token });
    } catch {
      throw new ServiceUnavailableException({
        code: 'INVITATION_EMAIL_FAILED',
        message:
          'The account was created, but the invitation email could not be delivered. Check email configuration and resend the invitation.',
      });
    }
  }

  async accept(input: { token: string; password: string; requestId?: string }): Promise<void> {
    const now = new Date();
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { id: true, userId: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= now
    ) {
      throw new BadRequestException(INVALID_INVITATION);
    }

    const passwordHash = await this.passwords.hash(input.password);
    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.userInvitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });
        const activated = await tx.user.updateMany({
          where: { id: invitation.userId, status: 'INVITED', passwordHash: null },
          data: { status: 'ACTIVE', passwordHash },
        });
        if (consumed.count !== 1 || activated.count !== 1) {
          throw new BadRequestException(INVALID_INVITATION);
        }
        await tx.userInvitation.updateMany({
          where: { userId: invitation.userId, id: { not: invitation.id }, acceptedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.record(tx, {
          action: 'user.invitation_accepted',
          entityType: 'user',
          entityId: invitation.userId,
          actorUserId: invitation.userId,
          newValues: { status: 'ACTIVE' },
          requestId: input.requestId,
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(INVALID_INVITATION);
    }
  }
}
