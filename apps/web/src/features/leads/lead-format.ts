import { PRODUCT_INTEREST_LABELS, type ProductInterest } from '@autonova/enums';
import { ApiError } from '@/lib/api-client';

/** `WALK_IN` -> `Walk In`. Used for enum values shown to people. */
export const labelFor = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

/** Catalogue name of a product, e.g. `RETAIL_POS` -> `Retail POS`. */
export const productLabel = (value: ProductInterest) => PRODUCT_INTEREST_LABELS[value];

/** Safe, plain-language message for a failed lead request. Never echoes the server's text. */
export const leadErrorText = (error: unknown) =>
  error instanceof ApiError && error.status === 403
    ? 'You do not have access to this lead.'
    : error instanceof ApiError && error.status === 404
      ? 'This lead is unavailable in your pipeline.'
      : error instanceof ApiError && error.status === 401
        ? 'Your session ended. Sign in again.'
        : error instanceof ApiError && error.code === 'LEAD_DUPLICATE_SUSPECTED'
          ? 'A lead with the same phone number or company already exists. Review the matches, then confirm to save anyway.'
          : error instanceof ApiError && error.code === 'INVALID_STAGE_TRANSITION'
            ? 'That stage change is not available. Refresh the lead and choose an available action.'
            : error instanceof ApiError && error.code === 'LEAD_STAGE_CHANGED'
              ? 'This lead changed while you were working. Refresh it and try again.'
              : error instanceof ApiError && error.code === 'QUALIFICATION_NOTE_REQUIRED'
                ? 'Add a note confirming the qualification result.'
                : error instanceof ApiError && error.code === 'REVISIT_DATE_REQUIRED'
                  ? 'Choose a follow-up date for revisit later.'
                  : error instanceof ApiError && error.code === 'REVISIT_DATE_NOT_ALLOWED'
                    ? 'A follow-up date is only used for revisit later.'
                    : 'We could not complete the request. Check the details and try again.';
