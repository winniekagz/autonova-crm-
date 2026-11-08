import { ApiError } from '@/lib/api-client';

export const INDUSTRY_LABELS = {
  RETAIL: 'Retail',
  HOSPITALITY: 'Hospitality',
  AUTOMOTIVE: 'Automotive',
  MANUFACTURING: 'Manufacturing',
  LOGISTICS: 'Logistics',
  EDUCATION: 'Education',
  HEALTHCARE: 'Healthcare',
  FINANCE: 'Finance',
  AGRICULTURE: 'Agriculture',
  REAL_ESTATE: 'Real estate',
  TECHNOLOGY: 'Technology',
  GOVERNMENT: 'Government',
  OTHER: 'Other',
} as const;

const MESSAGES: Record<string, string> = {
  COMPANY_KRA_PIN_EXISTS:
    'A company with this KRA PIN already exists. Open the existing company instead; if you cannot see it, ask a Director.',
  COMPANY_DUPLICATE_SUSPECTED:
    'A company with the same name already exists. Review the matches, then confirm to save anyway.',
  COMPANY_HAS_OPEN_LEADS:
    'This company still has open leads. Close or disqualify them before archiving it.',
  COMPANY_ARCHIVED: 'This company is archived. Restore it before changing it.',
  CONTACT_ARCHIVED: 'This contact is archived. Restore it before changing it.',
  CONTACT_IN_USE: 'This contact is linked to a lead. Remove them from the lead before archiving.',
  COMPANY_NOT_FOUND: 'This company is unavailable in your list.',
  CONTACT_NOT_FOUND: 'This contact is unavailable.',
};

/** Safe, plain-language message for a failed company or contact request. Never echoes the server's text. */
export function companyErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    if (error.status === 401) return 'Your session ended. Sign in again.';
    if (error.status === 403) return 'You do not have access to this.';
    if (error.status === 404) return 'This record is unavailable.';
    if (error.status === 429) return 'Too many requests. Wait a moment and try again.';
    if (error.status === 0)
      return 'We could not reach the server. Check your connection and try again.';
  }
  return 'We could not complete the request. Check the details and try again.';
}
