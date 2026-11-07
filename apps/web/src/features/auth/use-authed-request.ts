'use client';

import { useCallback } from 'react';
import { runAuthed } from './authed-call';
import { useAuth } from './auth-context';

/** Component-facing wrapper around `runAuthed`; see there for how each failure is treated. */
export function useAuthedRequest() {
  const { getAccessToken, renewAccessToken, expireSession } = useAuth();
  return useCallback(
    <T>(call: (token: string) => Promise<T>): Promise<T> =>
      runAuthed({ getAccessToken, renewAccessToken, expireSession }, call),
    [getAccessToken, renewAccessToken, expireSession],
  );
}
