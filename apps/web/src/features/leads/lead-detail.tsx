'use client';

import Link from 'next/link';
import type { LeadDto } from '@autonova/contracts';
import { Alert } from '@/components/ui/alert';
import { Tabs } from '@/components/ui/tabs';
import { ActivityTimeline } from '@/features/activities/activity-timeline';
import { ClientAccountCard } from '@/features/sales/client-account-card';
import { QualificationPanel } from '@/features/sales/qualification-panel';
import { QuotationsPanel } from '@/features/sales/quotations-panel';
import { TorWorkspace } from '@/features/sales/tor-workspace';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { labelFor, productLabel } from './lead-format';
import { LeadLifecycle } from './lead-lifecycle';
import { LeadNextSteps } from './lead-next-steps';
import { LeadStageBadge } from './lead-stage-badge';
import { LeadStageTracker } from './lead-stage-tracker';
import { LeadRelationships } from './lead-relationships';
import { LeadReminders } from './lead-reminders';
import { useLead } from './use-lead';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function interestText(lead: LeadDto) {
  if (lead.productInterest) return productLabel(lead.productInterest);
  if (lead.legacyProductInterest)
    return `${lead.legacyProductInterest} (needs a catalogue product)`;
  return null;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium" title={value || undefined}>
        {value || '—'}
      </dd>
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const state = useLead(id);
  if (state.kind === 'error') return <Alert tone="error">{state.message}</Alert>;
  if (state.kind === 'loading') return <p role="status">Loading lead…</p>;
  const { lead } = state;
  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
        href="/leads"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line"
        >
          ‹
        </span>
        Back to leads
      </Link>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
            >
              {initialsOf(lead.name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-navy">{lead.name}</h1>
                <LeadStageBadge stage={lead.stage} />
              </div>
              <p className="mt-1 text-ink-soft">
                {lead.companyName || 'Individual prospect'} · Owner {lead.ownerName}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-4 text-[13px] text-ink-soft">
                {lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : null}
                {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null}
              </p>
            </div>
          </div>
          <Link
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            href={`/leads/${lead.id}/edit`}
          >
            Edit lead
          </Link>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Interest" value={interestText(lead)} />
          <Fact
            label="Estimated value"
            value={lead.estimatedValue ? `${lead.currency} ${lead.estimatedValue}` : null}
          />
          <Fact
            label="Probability"
            value={lead.probability === null ? null : `${lead.probability}%`}
          />
          <Fact label="Next action" value={lead.nextAction} />
          <Fact label="Follow-up (Nairobi time)" value={formatNairobiDateTime(lead.nextActionAt)} />
          <Fact label="Created" value={formatNairobiDateTime(lead.createdAt)} />
        </dl>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">Lead stage</p>
          <LeadStageTracker lead={lead} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
          <LeadNextSteps lead={lead} />
          <Tabs
            label="Lead workspace"
            items={[
              {
                id: 'activity',
                label: 'Activity timeline',
                content: <ActivityTimeline lead={lead} />,
              },
              {
                id: 'people',
                label: 'Company & contacts',
                content: <LeadRelationships lead={lead} />,
              },
              { id: 'reminders', label: 'Reminders', content: <LeadReminders lead={lead} /> },
              {
                id: 'qualification',
                label: 'Qualification',
                content: <QualificationPanel lead={lead} />,
              },
              { id: 'scope', label: 'Scope (ToR)', content: <TorWorkspace lead={lead} /> },
              { id: 'quotes', label: 'Quotations', content: <QuotationsPanel lead={lead} /> },
            ]}
          />
        </div>

        <aside className="space-y-4" aria-label="Lead summary">
          <SideCard title="Lead details">
            <dl className="mt-3 space-y-3">
              <Fact label="Email" value={lead.email} />
              <Fact label="Phone" value={lead.phone} />
              <Fact label="Source" value={labelFor(lead.source)} />
              <Fact label="Referrer" value={lead.referrerName} />
              <Fact label="Owner" value={lead.ownerName} />
              <Fact label="Updated" value={formatNairobiDateTime(lead.updatedAt)} />
            </dl>
          </SideCard>
          <SideCard title="Notes">
            <p className="mt-2 whitespace-pre-wrap text-sm">{lead.notes || '—'}</p>
          </SideCard>
          <ClientAccountCard lead={lead} />
          <LeadLifecycle lead={lead} />
        </aside>
      </div>
    </section>
  );
}
