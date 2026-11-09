import type { TorTotalsDto, TorVersionDto } from '@autonova/contracts';
import { CYCLE_LABELS, formatMoney } from './sales-format';

export function TotalsTable({
  currency,
  totals,
  vatRate,
  exempt,
}: {
  currency: string;
  totals: Pick<
    TorTotalsDto,
    | 'oneOffSubtotal'
    | 'discountAmount'
    | 'netOneOff'
    | 'vatOneOff'
    | 'totalOneOff'
    | 'recurringVat'
    | 'recurringTotal'
  >;
  vatRate: string;
  exempt: boolean;
}) {
  const row = (label: string, amount: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd>{formatMoney(currency, amount)}</dd>
    </div>
  );
  return (
    <dl className="grid gap-1 text-sm" aria-label="Totals worked out by the server">
      {row('One-off subtotal', totals.oneOffSubtotal)}
      {row('Discount', totals.discountAmount)}
      {row('Net one-off', totals.netOneOff)}
      {row(exempt ? 'VAT (exempt)' : `VAT ${vatRate}%`, totals.vatOneOff)}
      {row('One-off total', totals.totalOneOff, true)}
      {row('Recurring VAT', totals.recurringVat)}
      {row('Recurring total', totals.recurringTotal, true)}
    </dl>
  );
}

/** A read-only view of one version: what is in scope, what is not, the recurring plan and the totals. */
export function VersionView({ version }: { version: TorVersionDto }) {
  const inScope = version.scopeItems.filter((i) => i.inScope);
  const outOfScope = version.scopeItems.filter((i) => !i.inScope);
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="text-sm font-medium">In scope</h4>
        {inScope.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing in scope yet.</p>
        ) : (
          <ul className="mt-1 grid gap-1 text-sm">
            {inScope.map((i) => (
              <li key={i.id} className="flex justify-between gap-4">
                <span>
                  {i.name} <span className="text-ink-soft">({i.estimateDays} days)</span>
                </span>
                <span>{formatMoney(version.currency, i.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {outOfScope.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Out of scope</h4>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {outOfScope.map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {version.addons.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Add-ons</h4>
          <ul className="mt-1 grid gap-1 text-sm">
            {version.addons.map((a) => (
              <li key={a.id} className="flex justify-between gap-4">
                <span>
                  {a.description} <span className="text-ink-soft">× {a.quantity}</span>
                </span>
                <span>{formatMoney(version.currency, a.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {version.hostingCycle && Number(version.hostingAmount) > 0 ? (
        <p className="text-sm">
          Recurring: {version.hostingName || 'Hosting and support'},{' '}
          {formatMoney(version.currency, version.hostingAmount)} per{' '}
          {CYCLE_LABELS[version.hostingCycle]}
        </p>
      ) : null}
      {version.milestones.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Milestones</h4>
          <ul className="mt-1 text-sm">
            {version.milestones.map((m) => (
              <li key={m.id}>
                {m.name} · {m.targetDate}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <TotalsTable
        currency={version.currency}
        totals={version.totals}
        vatRate={version.vatRate}
        exempt={version.vatTreatment === 'EXEMPT'}
      />
    </div>
  );
}
