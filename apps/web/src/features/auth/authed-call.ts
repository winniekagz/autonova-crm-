import { ApiError } from '@/lib/api-client';

export interface AuthedAccess {
  getAccessToken: () => Promise<string>;
  /** Replacement for a token the API said was expired; coordinated, so concurrent calls share it. */
  renewAccessToken: (stale: string) => Promise<string>;
  /** The server no longer accepts this sign-in. */
  expireSession: () => void;
}

/**
 * Runs an API call with a valid access token. What each failure means:
 *
 * - 401 TOKEN_EXPIRED: the token timed out. The guard answers this BEFORE any handler runs, so the
 *   operation was not performed and retrying it once is safe even for a POST/PATCH/DELETE.
 * - any other 401: the session is revoked, expired or the user is disabled. Refreshing cannot fix
 *   that, so the local session is dropped (no refresh attempt).
 * - 403 (FORBIDDEN or MFA_REQUIRED): authorization, not authentication. Passed to the caller
 *   untouched; never a reason to refresh, retry or sign out.
 * - network errors and everything else: passed to the caller untouched.
 *
 * A call is retried at most once, so a failing refresh or a repeating 401 cannot loop.
 */
export async function runAuthed<T>(
  access: AuthedAccess,
  call: (token: string) => Promise<T>,
): Promise<T> {
  const token = await access.getAccessToken();
  try {
    return await call(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (error.code !== 'TOKEN_EXPIRED') {
      access.expireSession();
      throw error;
    }
    const renewed = await access.renewAccessToken(token);
    try {
      return await call(renewed);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) access.expireSession();
      throw retryError;
    }
  }
}
