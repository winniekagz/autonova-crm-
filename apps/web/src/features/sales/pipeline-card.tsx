'use client';

import { PermissionKey } from '@autonova/enums';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { labelFor } from '@/features/leads/lead-format';
import { formatMoney, salesErrorText } from './sales-format';
import { usePipelineSummary } from './sales.queries';

/** Counts come from the server and respect the viewer’s lead ownership scope. Nothing is added up here. */
export function PipelineCard() {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.LeadsList);
  const summary = usePipelineSummary(allowed);
  if (!allowed) return null;
  const data = summary.data;
  const tiles = data
    ? [
        ['Qualified opportunities', data.qualifiedOpportunities],
        ['ToRs awaiting signature', data.torsAwaitingSignature],
        ['Signed deals', data.signedDeals],
        ['Won', data.won],
        ['Lost', data.lost],
        ['Overdue follow-ups', data.overdueFollowUps],
        ['Revisits due', data.revisitsDue],
      ]
    : [];
  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="pipeline-heading"
    >
      <h2 id="pipeline-heading" className="text-base font-semibold">
        Pipeline
      </h2>
      {summary.isLoading ? (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Loading pipeline…
        </p>
      ) : summary.isError ? (
        <div className="mt-2">
          <Alert tone="error">{salesErrorText(summary.error)}</Alert>
        </div>
      ) : data ? (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="By stage">
            {data.stages.map((s) => (
              <li key={s.stage} className="rounded-md bg-canvas p-2">
                <span className="block text-xs text-ink-soft">{labelFor(s.stage)}</span>
                <span className="text-lg font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {data.openValue.length > 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Open value: {data.openValue.map((v) => formatMoney(v.currency, v.amount)).join(' · ')}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
