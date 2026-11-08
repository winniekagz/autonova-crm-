import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';

/** One extra attempt is enough to ride out a dropped connection; more only delays the error. */
const MAX_READ_RETRIES = 1;

/**
 * Reads are safe to repeat, but only failures that can pass on their own are worth repeating:
 * a network drop (status 0) or a server fault (5xx). A 4xx is a permanent answer (not signed in,
 * not allowed, not found, invalid), and anything that is not an ApiError, such as a response that
 * does not match the contract, is a defect that retrying cannot fix.
 *
 * Expired access tokens are not handled here: `runAuthed` renews the token and retries once
 * before the error ever reaches the query.
 */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_READ_RETRIES) return false;
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

/**
 * Create one per app instance (never a module-level singleton: the server would share it between
 * users). `staleTime` stays at 0, so cached data is shown instantly and then refreshed; features
 * whose data rarely changes opt in to a longer time on their own query.
 */
export function createQueryClient(
  queryOverrides: NonNullable<DefaultOptions['queries']> = {},
): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryRead, ...queryOverrides },
      // A write may already have been processed when the response is lost: never repeat it.
      mutations: { retry: false },
    },
  });
}
