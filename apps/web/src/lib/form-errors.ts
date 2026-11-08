import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';

/**
 * Puts the API's field-level validation problems onto the matching form fields.
 *
 * The field names come from the server, so only names the form actually owns are used: an unknown
 * or malformed path is ignored instead of being written into form state. Returns true when at
 * least one message was shown on a field, so the caller knows whether a general message is still
 * needed.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly FieldPath<T>[],
): boolean {
  if (!(error instanceof ApiError)) return false;
  let applied = false;
  for (const detail of error.details) {
    const field = fields.find((candidate) => candidate === detail.path);
    if (!field) continue;
    setError(field, { type: 'server', message: detail.message });
    applied = true;
  }
  return applied;
}
