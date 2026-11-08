'use client';

import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { labelFor, productLabel } from './lead-format';
import { LeadLifecycle } from './lead-lifecycle';
import { LeadRelationships } from './lead-relationships';
import { LeadReminders } from './lead-reminders';
import { useLead } from './use-lead';

export function LeadDetail({ id }: { id: string }) {
  const state = useLead(id);
  if (state.kind === 'error') return <Alert tone="error">{state.message}</Alert>;
  if (state.kind === 'loading') return <p role="status">Loading lead…</p>;
  const { lead } = state;
  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">{labelFor(lead.stage)}</p>
          <h1 className="text-2xl font-semibold text-navy">{lead.name}</h1>
          <p className="mt-1 text-ink-soft">
            {lead.companyName || 'Individual prospect'} · Owner {lead.ownerName}
          </p>
        </div>
        <Link
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
          href={`/leads/${lead.id}/edit`}
        >
          Edit lead
        </Link>
      </div>
      <dl className="mt-5 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
        {[
          ['Email', lead.email],
          ['Phone', lead.phone],
          ['Source', labelFor(lead.source)],
          ['Referrer', lead.referrerName],
          [
            'Interest',
            lead.productInterest
              ? productLabel(lead.productInterest)
              : lead.legacyProductInterest
                ? `${lead.legacyProductInterest} (needs a catalogue product)`
                : null,
          ],
          [
            'Estimated value',
            lead.estimatedValue ? `${lead.currency} ${lead.estimatedValue}` : null,
          ],
          ['Probability', lead.probability === null ? null : `${lead.probability}%`],
          ['Next action', lead.nextAction],
          ['Follow-up (Nairobi time)', formatNairobiDateTime(lead.nextActionAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="mt-1 text-sm">{value || '—'}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-soft">Notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm">{lead.notes || '—'}</dd>
        </div>
      </dl>
      <LeadRelationships lead={lead} />
      <LeadReminders lead={lead} />
      <LeadLifecycle lead={lead} />
      <Link className="mt-4 inline-block text-sm text-primary underline" href="/leads">
        Back to leads
      </Link>
    </section>
  );
}
