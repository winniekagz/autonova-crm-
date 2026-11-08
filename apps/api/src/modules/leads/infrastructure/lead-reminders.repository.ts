import { Injectable } from '@nestjs/common';
import type { LeadReminderDto, Paginated } from '@autonova/contracts';
import { LeadReminderReason, LeadReminderStatus } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { REMINDER_LEASE_MS, REMINDER_MAX_LATENESS_MS } from '../domain/lead-reminder-policy.js';

type Db = Prisma.TransactionClient;

const claimInclude = {
  lead: {
    select: {
      id: true,
      name: true,
      companyName: true,
      company: { select: { name: true } },
      stage: true,
      nextAction: true,
      nextActionAt: true,
    },
  },
  recipient: {
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      roles: {
        select: {
          role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
        },
      },
    },
  },
} as const;

export type ClaimedReminder = Prisma.LeadReminderGetPayload<{ include: typeof claimInclude }>;

@Injectable()
export class LeadRemindersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the delivery record for every active lead whose follow-up instant has arrived and has no
   * record yet. One statement, and `(lead_id, due_at)` is unique: concurrent or repeated runs add each
   * reminder exactly once. Rescheduling a follow-up creates a new record for the new instant.
   */
  async enqueueDue(now: Date, take: number): Promise<number> {
    const earliest = new Date(now.getTime() - REMINDER_MAX_LATENESS_MS);
    return this.prisma.$executeRaw`
      INSERT INTO "lead_reminders" ("id", "lead_id", "recipient_user_id", "due_at", "next_attempt_at", "updated_at")
      SELECT gen_random_uuid(), "id", "owner_user_id", "next_action_at", ${now}, ${now}
        FROM "leads"
       WHERE "next_action_at" <= ${now} AND "next_action_at" >= ${earliest}
         AND "stage" NOT IN ('WON', 'LOST', 'DISQUALIFIED')
       ORDER BY "next_action_at"
       LIMIT ${take}
      ON CONFLICT ("lead_id", "due_at") DO NOTHING`;
  }

  /**
   * Leases up to `take` due reminders to this worker. The lease moves `next_attempt_at` forward in
   * the same statement that selects the rows (`FOR UPDATE SKIP LOCKED`), so two workers never
   * receive the same reminder, and a crashed worker's reminders return after the lease expires.
   */
  async claimDue(now: Date, take: number): Promise<ClaimedReminder[]> {
    const lease = new Date(now.getTime() + REMINDER_LEASE_MS);
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "lead_reminders" SET "next_attempt_at" = ${lease}, "last_attempt_at" = ${now}, "updated_at" = ${now}
       WHERE "id" IN (
         SELECT "id" FROM "lead_reminders"
          WHERE "status" = 'PENDING' AND "next_attempt_at" <= ${now}
          ORDER BY "next_attempt_at", "id"
          LIMIT ${take}
          FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    if (claimed.length === 0) return [];
    return this.prisma.leadReminder.findMany({
      where: { id: { in: claimed.map((row) => row.id) } },
      include: claimInclude,
      orderBy: { dueAt: 'asc' },
    });
  }

  markSent(db: Db, id: string, at: Date, attempts: number) {
    return db.leadReminder.update({
      where: { id },
      data: { status: LeadReminderStatus.Sent, sentAt: at, attempts, reason: null },
    });
  }

  markSkipped(db: Db, id: string, reason: LeadReminderReason) {
    return db.leadReminder.update({
      where: { id },
      data: { status: LeadReminderStatus.Skipped, reason },
    });
  }

  markFailed(db: Db, id: string, attempts: number, reason: LeadReminderReason) {
    return db.leadReminder.update({
      where: { id },
      data: { status: LeadReminderStatus.Failed, attempts, reason },
    });
  }

  scheduleRetry(
    db: Db,
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    reason: LeadReminderReason,
  ) {
    return db.leadReminder.update({
      where: { id },
      data: { attempts, nextAttemptAt, reason },
    });
  }

  async listForLead(
    leadId: string,
    ownerUserId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<Paginated<LeadReminderDto> | null> {
    const scoped = await this.prisma.lead.findFirst({
      where: { id: leadId, ...(ownerUserId ? { ownerUserId } : {}) },
      select: { id: true },
    });
    if (!scoped) return null;
    const [rows, total] = await Promise.all([
      this.prisma.leadReminder.findMany({
        where: { leadId },
        include: { recipient: { select: { fullName: true } } },
        orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.leadReminder.count({ where: { leadId } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        dueAt: row.dueAt.toISOString(),
        status: row.status,
        attempts: row.attempts,
        lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        reason: row.reason,
        recipientName: row.recipient.fullName,
      })),
      total,
      page,
      pageSize,
    };
  }
}
