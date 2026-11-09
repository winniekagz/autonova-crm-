import type { LeadDto } from '@autonova/contracts';
import type { LeadStage } from '@autonova/enums';
import { labelFor } from './lead-format';

const PATH: LeadStage[] = [
  'NEW_LEAD',
  'VISITS_AND_CALLS',
  'QUALIFIED',
  'SCOPE_ALIGNMENT',
  'TOR_QUOTE_SENT',
  'WON',
];

/** Where the lead is on the path to a deal. Disqualified and Lost leave the path and say so. */
export function LeadStageTracker({ lead }: { lead: LeadDto }) {
  const { stage } = lead;
  const exited = stage === 'DISQUALIFIED' || stage === 'LOST';
  const index = PATH.indexOf(stage);

  return (
    <div>
      {exited ? (
        <p className="mb-2 text-[13px] font-medium text-danger">
          This lead is {labelFor(stage)}
          {stage === 'LOST' && lead.lostReason ? `: ${lead.lostReason}` : ''}
          {stage === 'DISQUALIFIED' && lead.disqualificationReason
            ? `: ${labelFor(lead.disqualificationReason)}`
            : ''}
          {stage === 'DISQUALIFIED' && lead.revisitOn
            ? `. Returns to New Lead on ${lead.revisitOn}`
            : ''}
          .
        </p>
      ) : null}
      <ol aria-label="Lead stage" className="flex gap-1 overflow-x-auto pb-1">
        {PATH.map((step, i) => {
          const done = !exited && i < index;
          const current = !exited && i === index;
          const tone = current
            ? 'bg-success text-white'
            : done
              ? 'bg-success-soft text-success'
              : 'bg-canvas text-ink-soft';
          return (
            <li
              key={step}
              aria-current={current ? 'step' : undefined}
              className={`flex min-w-28 flex-1 items-center justify-center gap-1 whitespace-nowrap px-3 py-2 text-[13px] font-medium ${tone} ${
                i === 0 ? 'rounded-l-md' : ''
              } ${i === PATH.length - 1 ? 'rounded-r-md' : ''}`}
            >
              {done ? <span aria-hidden="true">✓</span> : null}
              {labelFor(step)}
              {done ? <span className="sr-only"> (completed)</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
