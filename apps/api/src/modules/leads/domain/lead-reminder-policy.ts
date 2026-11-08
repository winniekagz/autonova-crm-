import { LeadReminderReason, LeadStage } from '@autonova/enums';

/** Tunable delivery rules for next-action reminders. */
export const REMINDER_MAX_ATTEMPTS = 5;
/** A claimed reminder is invisible to other workers for this long; a crashed worker is retried after it. */
export const REMINDER_LEASE_MS = 10 * 60_000;
/** A follow-up this long overdue is not announced any more (also avoids a flood after downtime or migration). */
export const REMINDER_MAX_LATENESS_MS = 3 * 24 * 3_600_000;

const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 3_600_000] as const;

const INACTIVE_STAGES: ReadonlySet<LeadStage> = new Set([
  LeadStage.Won,
  LeadStage.Lost,
  LeadStage.Disqualified,
]);

export const isReminderEligibleStage = (stage: LeadStage) => !INACTIVE_STAGES.has(stage);

export interface ReminderFacts {
  reminderDueAt: Date;
  lead: { stage: LeadStage; nextActionAt: Date };
  recipient: { active: boolean; hasEmail: boolean; canReadLeads: boolean };
  now: Date;
}

export type ReminderDecision = { action: 'send' } | { action: 'skip'; reason: LeadReminderReason };

/** Pure decision: should this due reminder still be delivered, and if not, why not? */
export function decideReminder(facts: ReminderFacts): ReminderDecision {
  const { lead, recipient, reminderDueAt, now } = facts;
  if (!isReminderEligibleStage(lead.stage)) {
    return { action: 'skip', reason: LeadReminderReason.LeadNotActive };
  }
  if (lead.nextActionAt.getTime() !== reminderDueAt.getTime()) {
    return { action: 'skip', reason: LeadReminderReason.FollowUpChanged };
  }
  if (now.getTime() - reminderDueAt.getTime() > REMINDER_MAX_LATENESS_MS) {
    return { action: 'skip', reason: LeadReminderReason.TooOverdue };
  }
  if (!recipient.active || !recipient.hasEmail || !recipient.canReadLeads) {
    return { action: 'skip', reason: LeadReminderReason.RecipientUnavailable };
  }
  return { action: 'send' };
}

/** Delay before the next try after `attempts` failed deliveries, or null when attempts are exhausted. */
export function retryDelayMs(attempts: number): number | null {
  if (attempts >= REMINDER_MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1] ?? RETRY_DELAYS_MS[0];
}
