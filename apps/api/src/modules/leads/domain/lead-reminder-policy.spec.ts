import { LeadReminderReason, LeadStage } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import {
  REMINDER_MAX_ATTEMPTS,
  REMINDER_MAX_LATENESS_MS,
  decideReminder,
  retryDelayMs,
} from './lead-reminder-policy.js';

const due = new Date('2026-11-10T06:00:00.000Z');
const facts = (over: Partial<Parameters<typeof decideReminder>[0]> = {}) => ({
  reminderDueAt: due,
  lead: { stage: LeadStage.NewLead, nextActionAt: due },
  recipient: { active: true, hasEmail: true, canReadLeads: true },
  now: new Date(due.getTime() + 60_000),
  ...over,
});

describe('decideReminder', () => {
  it('sends for an active lead whose follow-up has not changed', () => {
    expect(decideReminder(facts())).toEqual({ action: 'send' });
  });

  it.each([LeadStage.Won, LeadStage.Lost, LeadStage.Disqualified])('skips a %s lead', (stage) => {
    expect(decideReminder(facts({ lead: { stage, nextActionAt: due } }))).toEqual({
      action: 'skip',
      reason: LeadReminderReason.LeadNotActive,
    });
  });

  it('skips when the follow-up was moved after the reminder was queued', () => {
    const moved = new Date(due.getTime() + 86_400_000);
    expect(
      decideReminder(facts({ lead: { stage: LeadStage.NewLead, nextActionAt: moved } })),
    ).toEqual({ action: 'skip', reason: LeadReminderReason.FollowUpChanged });
  });

  it('skips a reminder that is too late to be useful', () => {
    const now = new Date(due.getTime() + REMINDER_MAX_LATENESS_MS + 1);
    expect(decideReminder(facts({ now }))).toEqual({
      action: 'skip',
      reason: LeadReminderReason.TooOverdue,
    });
  });

  it.each([
    { active: false, hasEmail: true, canReadLeads: true },
    { active: true, hasEmail: false, canReadLeads: true },
    { active: true, hasEmail: true, canReadLeads: false },
  ])('skips when the recipient cannot be reached or may not read leads: %j', (recipient) => {
    expect(decideReminder(facts({ recipient }))).toEqual({
      action: 'skip',
      reason: LeadReminderReason.RecipientUnavailable,
    });
  });
});

describe('retryDelayMs', () => {
  it('backs off and then gives up', () => {
    const delays = Array.from({ length: REMINDER_MAX_ATTEMPTS }, (_, i) => retryDelayMs(i + 1));
    expect(delays.slice(0, -1).every((d) => typeof d === 'number' && d > 0)).toBe(true);
    const waits = delays.slice(0, -1);
    expect(waits).toEqual(waits.toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    expect(delays.at(-1)).toBeNull();
  });
});
