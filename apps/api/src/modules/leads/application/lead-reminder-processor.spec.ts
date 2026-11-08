import { LeadReminderReason, LeadStage } from '@autonova/enums';
import { describe, expect, it, vi } from 'vitest';
import { EmailNotConfiguredError } from '../../email/email.service.js';
import { LeadReminderProcessor } from './lead-reminder-processor.js';
import type { ClaimedReminder } from '../infrastructure/lead-reminders.repository.js';

const now = new Date('2026-11-10T06:30:00.000Z');
const due = new Date('2026-11-10T06:00:00.000Z');

const reminder = (over: Partial<ClaimedReminder> = {}): ClaimedReminder =>
  ({
    id: 'r-1',
    leadId: 'l-1',
    dueAt: due,
    attempts: 0,
    lead: {
      id: 'l-1',
      name: 'Achieng',
      companyName: 'Otieno',
      stage: LeadStage.NewLead,
      nextAction: 'Call',
      nextActionAt: due,
    },
    recipient: {
      id: 'u-1',
      email: 'bd@autonova.test',
      fullName: 'Sam',
      status: 'ACTIVE',
      roles: [{ role: { permissions: [{ permission: { key: 'leads:read' } }] } }],
    },
    ...over,
  }) as ClaimedReminder;

function setup(claimed: ClaimedReminder[], send: () => Promise<void>) {
  const calls: string[] = [];
  const tx = {};
  const repo = {
    enqueueDue: vi.fn().mockResolvedValue(claimed.length),
    claimDue: vi.fn().mockResolvedValue(claimed),
    markSent: vi.fn(async () => void calls.push('sent')),
    markSkipped: vi.fn(
      async (_db: unknown, _id: string, reason: string) => void calls.push(`skipped:${reason}`),
    ),
    markFailed: vi.fn(
      async (_db: unknown, _id: string, attempts: number, reason: string) =>
        void calls.push(`failed:${attempts}:${reason}`),
    ),
    scheduleRetry: vi.fn(
      async (_db: unknown, _id: string, attempts: number, at: Date, reason: string) =>
        void calls.push(`retry:${attempts}:${reason}:${at.toISOString()}`),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const prisma = { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
  const email = { sendLeadReminder: vi.fn(send) };
  const processor = new LeadReminderProcessor(
    prisma as never,
    repo as never,
    email as never,
    audit as never,
  );
  return { processor, calls, audit, email, repo };
}

describe('LeadReminderProcessor', () => {
  it('marks a delivered reminder sent and audits it', async () => {
    const { processor, calls, audit, email } = setup([reminder()], async () => undefined);
    const result = await processor.processDue(now);
    expect(result).toMatchObject({ sent: 1, skipped: 0, retrying: 0, failed: 0 });
    expect(calls).toEqual(['sent']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'lead.reminder_sent', actorUserId: null }),
    );
    expect(email.sendLeadReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bd@autonova.test',
        dueAtNairobi: expect.stringContaining('09:00'),
      }),
    );
  });

  it('records SMTP_NOT_CONFIGURED and schedules a retry instead of reporting success', async () => {
    const { processor, calls } = setup([reminder()], async () => {
      throw new EmailNotConfiguredError();
    });
    const result = await processor.processDue(now);
    expect(result).toMatchObject({ sent: 0, retrying: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^retry:1:SMTP_NOT_CONFIGURED:2026-11-10T06:35:00\.000Z$/);
  });

  it('records a provider failure as DELIVERY_FAILED with a growing delay', async () => {
    const { processor, calls } = setup([reminder({ attempts: 2 })], async () => {
      throw new Error('connect ECONNREFUSED');
    });
    await processor.processDue(now);
    expect(calls[0]).toMatch(/^retry:3:DELIVERY_FAILED:2026-11-10T07:30:00\.000Z$/);
  });

  it('gives up after the last attempt and leaves a FAILED record that the CLI reports', async () => {
    const { processor, calls } = setup([reminder({ attempts: 4 })], async () => {
      throw new Error('mailbox full');
    });
    const result = await processor.processDue(now);
    expect(result).toMatchObject({ failed: 1, retrying: 0 });
    expect(calls).toEqual([`failed:5:${LeadReminderReason.DeliveryFailed}`]);
  });

  it('skips with a reason, without sending, when the lead is no longer active', async () => {
    const done = reminder({ lead: { ...reminder().lead, stage: LeadStage.Lost } });
    const { processor, calls, email } = setup([done], async () => undefined);
    const result = await processor.processDue(now);
    expect(result.skipped).toBe(1);
    expect(calls).toEqual([`skipped:${LeadReminderReason.LeadNotActive}`]);
    expect(email.sendLeadReminder).not.toHaveBeenCalled();
  });

  it('does not send to an owner who can no longer read leads', async () => {
    const revoked = reminder({ recipient: { ...reminder().recipient, roles: [] } });
    const { processor, calls, email } = setup([revoked], async () => undefined);
    await processor.processDue(now);
    expect(calls).toEqual([`skipped:${LeadReminderReason.RecipientUnavailable}`]);
    expect(email.sendLeadReminder).not.toHaveBeenCalled();
  });

  it('reports a failure to record the outcome and carries on with the rest of the batch', async () => {
    const { processor, repo } = setup(
      [reminder({ id: 'a' }), reminder({ id: 'b' })],
      async () => undefined,
    );
    repo.markSent.mockRejectedValueOnce(new Error('db down'));
    const result = await processor.processDue(now);
    expect(result).toMatchObject({ failed: 1, sent: 1 });
  });
});
