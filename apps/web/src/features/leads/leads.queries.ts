'use client';

import type { LeadDto, LeadDuplicateCheckRequest, LeadSaveRequest } from '@autonova/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import * as leadsApi from './api';

/** Cache keys for this feature. Everything starts with 'leads' so one call can clear it all. */
export const leadsKeys = {
  all: ['leads'] as const,
  lists: () => ['leads', 'list'] as const,
  list: (search: string, page: number) => ['leads', 'list', { search, page }] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  history: (id: string) => ['leads', 'history', id] as const,
  reminders: (id: string) => ['leads', 'reminders', id] as const,
};

export function useLeadsList(search: string, page: number, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: leadsKeys.list(search, page),
    queryFn: () => request((token) => leadsApi.listLeads(token, search, page)),
    enabled,
  });
}

export function useLeadQuery(id: string) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: leadsKeys.detail(id),
    queryFn: () => request((token) => leadsApi.getLead(token, id)),
  });
}

export function useLeadHistory(id: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: leadsKeys.history(id),
    queryFn: () => request((token) => leadsApi.getLeadHistory(token, id)),
    enabled,
  });
}

export function useLeadReminders(id: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: leadsKeys.reminders(id),
    queryFn: () => request((token) => leadsApi.getLeadReminders(token, id)),
    enabled,
  });
}

/** Asks the server for possible duplicates; the form calls `mutate` when the user leaves a field. */
export function useCheckDuplicates() {
  const request = useAuthedRequest();
  return useMutation({
    mutationFn: (body: LeadDuplicateCheckRequest) =>
      request((token) => leadsApi.checkDuplicates(token, body)),
  });
}

function useLifecycleMutation<TBody>(
  id: string,
  mutate: (token: string, body: TBody) => Promise<LeadDto>,
) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => request((token) => mutate(token, body)),
    onSuccess: (saved) => {
      queryClient.setQueryData(leadsKeys.detail(id), saved);
      void queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leadsKeys.history(id) });
    },
  });
}

export const useTransitionLead = (id: string) =>
  useLifecycleMutation<Parameters<typeof leadsApi.transitionLead>[2]>(id, (token, body) =>
    leadsApi.transitionLead(token, id, body),
  );

export const useDisqualifyLead = (id: string) =>
  useLifecycleMutation<Parameters<typeof leadsApi.disqualifyLead>[2]>(id, (token, body) =>
    leadsApi.disqualifyLead(token, id, body),
  );

export const useMarkLeadLost = (id: string) =>
  useLifecycleMutation<Parameters<typeof leadsApi.markLeadLost>[2]>(id, (token, body) =>
    leadsApi.markLeadLost(token, id, body),
  );

/** Creates a lead, or updates `lead` when one is given. The caller reads `isPending` and `error`. */
export function useSaveLead(lead: LeadDto | undefined) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadSaveRequest) =>
      request((token) =>
        lead ? leadsApi.updateLead(token, lead.id, body) : leadsApi.createLead(token, body),
      ),
    onSuccess: (saved) => {
      // The server's answer is the freshest copy of this lead; every list may now be out of date.
      queryClient.setQueryData(leadsKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leadsKeys.reminders(saved.id) });
    },
  });
}
