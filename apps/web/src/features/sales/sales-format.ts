import type { BillingCycle } from '@autonova/enums';
import { ApiError } from '@/lib/api-client';

/** "179800.00" -> "KES 179,800.00". The amount is text from the server and is never turned into a float. */
export function formatMoney(currency: string, amount: string): string {
  const [whole = '0', fraction] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${fraction === undefined ? grouped : `${grouped}.${fraction}`}`;
}

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUAL: 'year',
};

export const RATING_LABELS = {
  NOT_MET: 'Not met',
  PARTIALLY_MET: 'Partly met',
  FULLY_MET: 'Fully met',
} as const;

const MESSAGES: Record<string, string> = {
  QUALIFICATION_NOT_ASSESSED: 'Record a BANT assessment before qualifying this lead.',
  QUALIFICATION_NOT_PASSED:
    'The latest assessment did not reach the pass mark. A Director can qualify it with a written reason.',
  OVERRIDE_REQUIRES_DIRECTOR: 'Only a Director can qualify a lead that did not pass.',
  QUALIFICATION_WRONG_STAGE: 'A BANT assessment is recorded while the lead is in Visits and calls.',
  TOR_NOT_FOUND: 'No Terms of Reference yet.',
  TOR_EXISTS: 'This lead already has a Terms of Reference.',
  TOR_LEAD_NOT_QUALIFIED: 'A Terms of Reference can be started once the lead is Qualified.',
  TOR_VERSION_NOT_DRAFT:
    'This version was already sent, so it cannot be edited. Start a new version for another round of changes.',
  TOR_VERSION_ALREADY_OPEN: 'A version is already in progress. Edit it or send it first.',
  TOR_SIGNED: 'This agreement is signed and locked.',
  TOR_NOTHING_IN_SCOPE: 'Add at least one in-scope item before sending.',
  TOR_DISCOUNT_APPROVAL_REQUIRED:
    'The discount is above the approval threshold. A Director must approve it before this can be sent.',
  TOR_VERSION_NOT_SENT: 'Only a version that has been sent can be signed.',
  TOR_VERSION_SUPERSEDED: 'That version was replaced by a newer one.',
  TOR_PARTY_ALREADY_SIGNED: 'That party has already signed this version.',
  TOR_AUTONOVA_SIGNER_MUST_BE_DIRECTOR: 'Only a Director can sign for Autonova.',
  TOR_LEAD_CLOSED: 'This lead is no longer open, so the agreement cannot be signed.',
  TOR_CATALOGUE_ITEM_UNAVAILABLE: 'A chosen catalogue item is no longer available.',
  QUOTATION_NO_TOR: 'Create the Terms of Reference first, or use a quick quote.',
  QUOTATION_TOR_NOT_SENT: 'Send the current Terms of Reference version before quoting from it.',
  QUOTATION_INVALID_TRANSITION: 'That status change is not available for this quotation.',
  QUOTATION_EXPIRED: 'This quotation has passed its validity date.',
  QUOTATION_ALREADY_PAST: 'The validity date has passed. Create a new quotation.',
  QUOTATION_NO_LINES: 'Add at least one line before sending.',
  QUOTATION_CHANGED: 'The quotation changed while you were working. Reload and try again.',
  LEAD_STAGE_CHANGED: 'This lead changed while you were working. Reload and try again.',
  LEAD_NOT_FOUND: 'This lead is unavailable in your pipeline.',
  FORBIDDEN: 'You do not have access to do this.',
};

/** Plain-language message for a failed sales request. Validation details are shown by the form itself. */
export function salesErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    if (error.status === 401) return 'Your session ended. Sign in again.';
    if (error.status === 403) return 'You do not have access to do this.';
    if (error.status === 404) return 'This record is unavailable.';
    if (error.status === 400) return 'Check the details and try again.';
    if (error.status === 0) return 'We could not reach the server. Check your connection.';
  }
  return 'We could not complete the request. Try again.';
}

const humanise = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
/** "GO_LIVE" -> "Go live". Used for the small fixed lists (add-on kinds, milestone kinds). */
export const kindLabel = humanise;
