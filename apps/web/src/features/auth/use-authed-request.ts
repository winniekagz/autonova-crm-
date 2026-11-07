'use client';

import { useCallback } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './auth-context';

/**
 * Runs an API call with the current access token. If the server answers 401 (the session was
 * revoked, expired, or the user was disabled) the local session is dropped so the shell redirects
 * to sign-in, and the error is still thrown so the caller stops what it was doing.
 */
export function useAuthedRequest() {
  const { accessToken, expireSession } = useAuth();
  return useCallback(
    async <T>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!accessToken) throw new ApiError(401, 'UNAUTHENTICATED', 'Not signed in');
      try {
        return await call(accessToken);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expireSession();
        throw error;
      }
    },
    [accessToken, expireSession],
  );
}
