'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from './api';
import { useAuthedRequest } from './use-authed-request';

export const sessionsKeys = { all: ['sessions'] as const };

export function useSessionsQuery() {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: sessionsKeys.all,
    queryFn: () => request((token) => authApi.listSessions(token)),
  });
}

/** Signs out one of the caller's sessions, then refreshes the list from the server. */
export function useRevokeSession() {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => request((token) => authApi.revokeSession(token, sessionId)),
    // Success or failure, the server knows best: a 404 means it had already ended elsewhere.
    onSettled: () => queryClient.invalidateQueries({ queryKey: sessionsKeys.all }),
  });
}
