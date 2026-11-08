'use client';

import type { LeadDto, LeadReminderDto } from '@autonova/contracts';
import { LeadReminderReason, LeadReminderStatus, LeadStage, PermissionKey } from '@autonova/enums';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { leadErrorText } from './lead-format';
import { useLeadReminders } from './leads.queries';

const STATUS_TEXT: Record<LeadReminderStatus, string> = {
  PENDING: 'Waiting to send',
  SENT: 'Email sent',
  FAILED: 'Not delivered',
  SKIPPED: 'Not sent',
};

const REASON_TEXT: Record<LeadReminderReason, string> = {
  SMTP_NOT_CONFIGURED: 'Email delivery is not set up on this system.',
  DELIVERY_FAILED: 'The email provider did not accept the message.',
  LEAD_NOT_ACTIVE: 'The lead was closed before the reminder was due.',
  FOLLOW_UP_CHANGED: 'The follow-up was rescheduled.',
  RECIPIENT_UNAVAILABLE: 'The owner is disabled, has no email or cannot read leads.',
  TOO_OVERDUE: 'Too long after the follow-up time to be useful.',
};

function describe(reminder: LeadReminderDto): string {
  if (reminder.status === LeadReminderStatus.Sent && reminder.sentAt) {
    return `Emailed to ${reminder.recipientName} on ${formatNairobiDateTime(reminder.sentAt)}.`;
  }
  const why = reminder.reason ? REASON_TEXT[reminder.reason] : '';
  if (reminder.status === LeadReminderStatus.Pending) {
    const tries = reminder.attempts > 0 ? ` ${reminder.attempts} attempt(s) so far.` : '';
    return `${why} Will retry automatically.${tries}`.trim();
  }
  return `${why}${reminder.attempts > 0 ? ` ${reminder.attempts} attempt(s).` : ''}`.trim();
}

/** Delivery record of next-action reminders; the emails themselves are sent by the scheduled worker. */
export function LeadReminders({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const reminders = useLeadReminders(lead.id, can(me, PermissionKey.LeadsRead));
  const items = reminders.data?.items ?? [];
  const active =
    lead.stage !== LeadStage.Won &&
    lead.stage !== LeadStage.Lost &&
    lead.stage !== LeadStage.Disqualified;
  const due = new Date(lead.nextActionAt).getTime() <= Date.now();
  const latest = items.find((item) => item.dueAt === lead.nextActionAt);

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="reminders-heading"
    >
      <h2 id="reminders-heading" className="text-lg font-semibold text-navy">
        Follow-up reminders
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {active
          ? `${lead.ownerName} is emailed when the follow-up time (${formatNairobiDateTime(lead.nextActionAt)}, Nairobi time) arrives.`
          : 'This lead is closed, so no reminders are sent.'}
      </p>
      {active && due && !latest && !reminders.isLoading && !reminders.isError ? (
        <div className="mt-3">
          <Alert tone="warning">
            This follow-up is overdue and no reminder has been recorded yet. Reminders are sent by a
            scheduled job; ask an administrator to check that it is running.
          </Alert>
        </div>
      ) : null}
      {reminders.isLoading ? (
        <p role="status" className="mt-3 text-sm">
          Loading reminders…
        </p>
      ) : reminders.isError ? (
        <div className="mt-3">
          <Alert tone="error">{leadErrorText(reminders.error)}</Alert>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No reminders sent yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((reminder) => (
            <li key={reminder.id} className="border-l-2 border-line pl-4 text-sm">
              <p className="font-medium text-ink">
                {STATUS_TEXT[reminder.status]} · due {formatNairobiDateTime(reminder.dueAt)}
              </p>
              <p className="mt-1 text-ink-soft">{describe(reminder)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
