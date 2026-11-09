import type { QuotationStatus } from '@autonova/enums';

/**
 * Quotation lifecycle (SOW 4.6). A quote is DRAFT until sent, then ACCEPTED or REJECTED by the client, or
 * EXPIRED when its validity date passes while it is still open. Acceptance NEVER converts a deal: only both
 * parties' signatures on the same ToR version do (SOW 4.7), so nothing here touches the lead.
 */
const TRANSITIONS: Readonly<Record<QuotationStatus, readonly QuotationStatus[]>> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const canMoveQuotation = (from: QuotationStatus, to: QuotationStatus) =>
  TRANSITIONS[from].includes(to);

/** The next statuses a person can choose, for the screen. EXPIRED is applied by the system, not chosen. */
export const nextQuotationStatuses = (from: QuotationStatus): QuotationStatus[] =>
  TRANSITIONS[from].filter((s) => s !== 'EXPIRED');

/** Has the validity date passed? `validUntil` is the last day the quote can be accepted (Nairobi date). */
export const isPastValidity = (validUntil: string, today: string) => validUntil < today;

export type SendProblem = 'ALREADY_PAST' | 'NO_LINES';

/** A quote can only be sent while still valid and with something to price. */
export function checkSendable(input: {
  validUntil: string;
  today: string;
  lineCount: number;
}): SendProblem | null {
  if (input.lineCount === 0) return 'NO_LINES';
  if (isPastValidity(input.validUntil, input.today)) return 'ALREADY_PAST';
  return null;
}

/** Adds whole days to a YYYY-MM-DD date, in UTC, so the result never depends on the host timezone. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
