import type {
  CompanyDuplicateCandidateDto,
  CompanyDuplicateCheckResult,
} from '@autonova/contracts';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';

interface CompanyDuplicateWarningProps {
  checking: boolean;
  failed: boolean;
  result: CompanyDuplicateCheckResult | undefined;
  /** The server asked for confirmation even though the panel found nothing to show. */
  confirmationRequired: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
}

function Match({ candidate }: { candidate: CompanyDuplicateCandidateDto }) {
  return (
    <li>
      <Link
        className="font-medium underline"
        href={`/companies/${candidate.id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {candidate.name}
      </Link>
      {candidate.kraPin ? ` · ${candidate.kraPin}` : ''}
      {candidate.location ? ` · ${candidate.location}` : ''}
      {candidate.archived ? ' · Archived (restore it instead of creating another)' : ''}
    </li>
  );
}

/**
 * A matching KRA PIN is the same legal entity, so it cannot be confirmed away. A matching name can:
 * two real companies may share one. Companies the user cannot open are only counted.
 */
export function CompanyDuplicateWarning({
  checking,
  failed,
  result,
  confirmationRequired,
  acknowledged,
  onAcknowledgedChange,
}: CompanyDuplicateWarningProps) {
  if (checking) {
    return (
      <p role="status" className="text-sm text-ink-soft sm:col-span-2">
        Checking for duplicates…
      </p>
    );
  }
  if (failed) {
    return (
      <div className="sm:col-span-2">
        <Alert tone="warning">
          We could not check for duplicates just now. You can still save; the server checks again.
        </Alert>
      </div>
    );
  }
  const exact = result?.exact ?? [];
  const potential = result?.potential ?? [];
  const hidden = result?.hiddenMatchCount ?? 0;
  if (exact.length === 0 && potential.length === 0 && hidden === 0 && !confirmationRequired)
    return null;

  return (
    <div className="space-y-3 sm:col-span-2">
      {exact.length > 0 ? (
        <Alert tone="error">
          <p className="font-medium">This KRA PIN already belongs to a company</p>
          <ul className="mt-2 space-y-1">
            {exact.map((candidate) => (
              <Match key={candidate.id} candidate={candidate} />
            ))}
          </ul>
          <p className="mt-2">Open that company instead of creating another.</p>
        </Alert>
      ) : null}
      {potential.length > 0 || hidden > 0 || confirmationRequired ? (
        <Alert tone="warning">
          <p className="font-medium">Possible duplicate</p>
          {potential.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {potential.map((candidate) => (
                <Match key={candidate.id} candidate={candidate} />
              ))}
            </ul>
          ) : null}
          {hidden > 0 ? (
            <p className="mt-2">
              {hidden === 1
                ? '1 more matching company is'
                : `${hidden} more matching companies are`}{' '}
              outside your list, so the details are not shown.
            </p>
          ) : null}
          {exact.length === 0 ? (
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(event) => onAcknowledgedChange(event.target.checked)}
              />
              <span>I have reviewed this and want to save the company anyway.</span>
            </label>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
