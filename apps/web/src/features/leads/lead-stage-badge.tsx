import type { LeadStage } from '@autonova/enums';
import { labelFor } from './lead-format';

const TONE: Record<LeadStage, string> = {
  NEW_LEAD: 'bg-canvas text-ink-soft border border-line',
  VISITS_AND_CALLS: 'bg-primary/10 text-primary',
  QUALIFIED: 'bg-success-soft text-success',
  SCOPE_ALIGNMENT: 'bg-cyan/10 text-cyan-700',
  TOR_QUOTE_SENT: 'bg-warning-soft text-warning',
  DISQUALIFIED: 'bg-danger-soft text-danger',
  WON: 'bg-success text-white',
  LOST: 'bg-danger text-white',
};

/** Stage is always text plus colour, never colour alone (docs/webdesign.md §3.2). */
export function LeadStageBadge({ stage }: { stage: LeadStage }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[stage]}`}
    >
      {labelFor(stage)}
    </span>
  );
}
