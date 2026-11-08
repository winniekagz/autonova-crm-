'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './auth-context';

/**
 * Empties the query cache whenever the session ends (sign-out, revoked or expired session,
 * rejected refresh). Cached lists and records belong to the person who fetched them: without this,
 * the next person to sign in on the same browser could briefly be shown the previous user's data.
 *
 * `unavailable` (the server could not be reached) does not clear anything: the session may still be
 * valid and the user is only asked to try again.
 */
export function ClearCacheOnSignOut() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'unauthenticated') queryClient.clear();
  }, [status, queryClient]);

  return null;
}
