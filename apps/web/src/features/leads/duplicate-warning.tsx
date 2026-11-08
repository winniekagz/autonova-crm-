import type { LeadDuplicateCheckResult } from '@autonova/contracts';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { formatNairobiDate } from '@/lib/nairobi-time';
import { labelFor } from './lead-format';

interface DuplicateWarningProps {
  checking: boolean;
  failed: boolean;
  result: LeadDuplicateCheckResult | undefined;
  /** The server refused the save until the user confirms, even if the panel found nothing to show. */
  confirmationRequired: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
}

const MATCH_LABEL = { PHONE: 'same phone', COMPANY: 'same company' } as const;

/**
 * Shows possible duplicates and asks the user to confirm before saving. A match never blocks the
 * save for good: two real people can share a switchboard or an employer. Leads the user may not
 * open are only counted, never described.
 */
export function DuplicateWarning({
  checking,
  failed,
  result,
  confirmationRequired,
  acknowledged,
  onAcknowledgedChange,
}: DuplicateWarningProps) {
  if (checking)
    return (
      <p role="status" className="text-sm text-ink-soft sm:col-span-2">
        Checking for duplicates…
      </p>
    );
  if (failed) {
    return (
      <div className="sm:col-span-2">
        <Alert tone="warning">
          We could not check for duplicates just now. You can still save; the server checks again.
        </Alert>
      </div>
    );
  }
  const candidates = result?.candidates ?? [];
  const hidden = result?.hiddenMatchCount ?? 0;
  if (candidates.length === 0 && hidden === 0 && !confirmationRequired) return null;

  return (
    <div className="sm:col-span-2">
      <Alert tone="warning">
        <p className="font-medium">Possible duplicate</p>
        {candidates.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  className="font-medium underline"
                  href={`/leads/${candidate.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {candidate.name}
                </Link>
                {' · '}
                {candidate.companyName || 'No company'}
                {candidate.phone ? ` · ${candidate.phone}` : ''}
                <span className="block text-xs">
                  {labelFor(candidate.stage)} · Owner {candidate.ownerName} · Added{' '}
                  {formatNairobiDate(candidate.createdAt)} ·{' '}
                  {candidate.matchedOn.map((match) => MATCH_LABEL[match]).join(' and ')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {hidden > 0 ? (
          <p className="mt-2">
            {hidden === 1 ? '1 more matching lead is' : `${hidden} more matching leads are`} in
            another person&apos;s pipeline, so the details are not shown.
          </p>
        ) : null}
        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledged}
            onChange={(event) => onAcknowledgedChange(event.target.checked)}
          />
          <span>I have reviewed this and want to save the lead anyway.</span>
        </label>
      </Alert>
    </div>
  );
}
