'use client';

import type { LeadDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { CYCLE_LABELS, formatMoney } from './sales-format';
import { useClientAccount } from './sales.queries';

/** Shown once both parties have signed: the account that conversion created. Read-only. */
export function ClientAccountCard({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const canRead = can(me, PermissionKey.ClientsRead);
  const account = useClientAccount(lead.id, canRead && lead.stage === 'WON');
  if (!canRead || lead.stage !== 'WON') return null;
  if (account.isLoading) return <p role="status">Loading client account…</p>;
  const data = account.data;
  if (!data) return null;
  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="client-heading"
    >
      <h2 id="client-heading" className="text-lg font-semibold text-navy">
        Client account {data.number}
      </h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-soft">Client</dt>
          <dd>{data.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Signed agreement</dt>
          <dd>Terms of Reference v{data.signedTorVersionNo}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Recurring plan</dt>
          <dd>
            {data.billingCycle && Number(data.planAmount) > 0
              ? `${data.planName ?? 'Plan'}: ${formatMoney(data.currency, data.planAmount)} per ${CYCLE_LABELS[data.billingCycle]}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Go-live</dt>
          <dd>{data.goLiveDate ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
