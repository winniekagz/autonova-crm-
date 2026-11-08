import { Injectable, Logger } from '@nestjs/common';
import { LeadReminderReason, PermissionKey, type LeadStage } from '@autonova/enums';
import { AuditService } from '../../audit/audit.service.js';
import { EmailNotConfiguredError, EmailService } from '../../email/email.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { decideReminder, retryDelayMs } from '../domain/lead-reminder-policy.js';
import { formatNairobiDateTime } from '../domain/nairobi-business-date.js';
import {
  LeadRemindersRepository,
  type ClaimedReminder,
} from '../infrastructure/lead-reminders.repository.js';

export interface ReminderProcessingResult {
  enqueued: number;
  claimed: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
}

/**
 * Idempotent one-shot worker, run on a recurring schedule by the deployment (`leads:send-reminders`).
 * Every reminder is a database row: restarts and downtime lose nothing, `(lead_id, due_at)` makes
 * enqueueing idempotent, and the lease in `claimDue` keeps parallel workers from sending twice.
 * Delivery is at-least-once: a crash after the email left but before the row is marked sent may
 * send it again after the lease expires.
 */
@Injectable()
export class LeadReminderProcessor {
  private readonly logger = new Logger(LeadReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: LeadRemindersRepository,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async processDue(at = new Date(), batchSize = 100): Promise<ReminderProcessingResult> {
    const result: ReminderProcessingResult = {
      enqueued: await this.reminders.enqueueDue(at, batchSize),
      claimed: 0,
      sent: 0,
      skipped: 0,
      retrying: 0,
      failed: 0,
    };
    const batch = await this.reminders.claimDue(at, batchSize);
    result.claimed = batch.length;
    for (const reminder of batch) {
      try {
        const outcome = await this.deliver(reminder, at);
        result[outcome] += 1;
      } catch (error) {
        // Leave the row leased: it is retried once the lease expires, and the next run reports it.
        result.failed += 1;
        this.logger.error(
          { err: error, reminderId: reminder.id, leadId: reminder.leadId },
          'Could not record a lead reminder outcome; it will be retried after its lease expires',
        );
      }
    }
    this.logger.log(result, 'Lead reminder processing finished');
    return result;
  }

  private async deliver(
    reminder: ClaimedReminder,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'retrying' | 'failed'> {
    const permissions = new Set(
      reminder.recipient.roles.flatMap((entry) =>
        entry.role.permissions.map((grant) => grant.permission.key),
      ),
    );
    const decision = decideReminder({
      reminderDueAt: reminder.dueAt,
      lead: { stage: reminder.lead.stage as LeadStage, nextActionAt: reminder.lead.nextActionAt },
      recipient: {
        active: reminder.recipient.status === 'ACTIVE',
        hasEmail: Boolean(reminder.recipient.email),
        canReadLeads: permissions.has(PermissionKey.LeadsRead),
      },
      now,
    });
    if (decision.action === 'skip') {
      await this.record(reminder, 'skipped', decision.reason, reminder.attempts, now);
      return 'skipped';
    }

    const attempts = reminder.attempts + 1;
    try {
      await this.email.sendLeadReminder({
        email: reminder.recipient.email,
        recipientName: reminder.recipient.fullName,
        leadId: reminder.lead.id,
        leadName: reminder.lead.name,
        companyName: reminder.lead.companyName,
        nextAction: reminder.lead.nextAction,
        dueAtNairobi: formatNairobiDateTime(reminder.dueAt),
      });
    } catch (error) {
      const reason =
        error instanceof EmailNotConfiguredError
          ? LeadReminderReason.SmtpNotConfigured
          : LeadReminderReason.DeliveryFailed;
      this.logger.warn(
        { err: error, reminderId: reminder.id, leadId: reminder.leadId, attempts },
        'Lead reminder delivery failed',
      );
      const delay = retryDelayMs(attempts);
      if (delay === null) {
        await this.record(reminder, 'failed', reason, attempts, now);
        return 'failed';
      }
      await this.record(
        reminder,
        'retrying',
        reason,
        attempts,
        now,
        new Date(now.getTime() + delay),
      );
      return 'retrying';
    }
    await this.record(reminder, 'sent', null, attempts, now);
    return 'sent';
  }

  private record(
    reminder: ClaimedReminder,
    outcome: 'sent' | 'skipped' | 'retrying' | 'failed',
    reason: LeadReminderReason | null,
    attempts: number,
    now: Date,
    retryAt?: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (outcome === 'sent') await this.reminders.markSent(tx, reminder.id, now, attempts);
      else if (reason && outcome === 'skipped')
        await this.reminders.markSkipped(tx, reminder.id, reason);
      else if (reason && outcome === 'failed')
        await this.reminders.markFailed(tx, reminder.id, attempts, reason);
      else if (reason && retryAt)
        await this.reminders.scheduleRetry(tx, reminder.id, attempts, retryAt, reason);
      await this.audit.record(tx, {
        action: `lead.reminder_${outcome}`,
        entityType: 'lead',
        entityId: reminder.leadId,
        actorUserId: null,
        newValues: { reminderId: reminder.id, attempts, ...(reason ? { reason } : {}) },
      });
    });
  }
}
