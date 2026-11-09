'use client';

import type {
  QualificationInput,
  QualifyRequest,
  QuickQuoteInput,
  QuoteFromTorInput,
  SignTorRequest,
  TorVersionInput,
} from '@autonova/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import { leadsKeys } from '@/features/leads/leads.queries';
import * as api from './api';

/** Everything starts with 'sales' so signing out clears it with the rest of the cache. */
export const salesKeys = {
  all: ['sales'] as const,
  qualification: (leadId: string) => ['sales', 'qualification', leadId] as const,
  settings: () => ['sales', 'settings'] as const,
  tor: (leadId: string) => ['sales', 'tor', leadId] as const,
  version: (leadId: string, no: number) => ['sales', 'tor', leadId, 'version', no] as const,
  diff: (leadId: string, from: number, to: number) =>
    ['sales', 'tor', leadId, 'diff', from, to] as const,
  quotations: (leadId: string) => ['sales', 'quotations', leadId] as const,
  client: (leadId: string) => ['sales', 'client', leadId] as const,
  pipeline: () => ['sales', 'pipeline'] as const,
  catalogue: () => ['sales', 'catalogue'] as const,
};

export function useQualification(leadId: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.qualification(leadId),
    queryFn: () => request((token) => api.getQualification(token, leadId)),
    enabled,
  });
}

export function useQualificationSettings(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.settings(),
    queryFn: () => request((token) => api.getQualificationSettings(token)),
    enabled,
  });
}

/** A lead's stage, history and every sales record change together, so refresh them as one. */
function useRefreshLead(leadId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leadsKeys.detail(leadId) }),
      queryClient.invalidateQueries({ queryKey: leadsKeys.history(leadId) }),
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: salesKeys.qualification(leadId) }),
      queryClient.invalidateQueries({ queryKey: salesKeys.tor(leadId) }),
      queryClient.invalidateQueries({ queryKey: salesKeys.quotations(leadId) }),
      queryClient.invalidateQueries({ queryKey: salesKeys.client(leadId) }),
      queryClient.invalidateQueries({ queryKey: salesKeys.pipeline() }),
    ]);
  };
}

export function useAssess(leadId: string) {
  const request = useAuthedRequest();
  const refresh = useRefreshLead(leadId);
  return useMutation({
    mutationFn: (body: QualificationInput) => request((token) => api.assess(token, leadId, body)),
    onSuccess: refresh,
  });
}

export function useQualify(leadId: string) {
  const request = useAuthedRequest();
  const refresh = useRefreshLead(leadId);
  return useMutation({
    mutationFn: (body: QualifyRequest) => request((token) => api.qualify(token, leadId, body)),
    onSuccess: refresh,
  });
}

/** A missing ToR is a normal state (404 TOR_NOT_FOUND), not a failure: the screen offers to start one. */
export function useTor(leadId: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.tor(leadId),
    queryFn: async () => {
      try {
        return await request((token) => api.getTor(token, leadId));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404 && error.code === 'TOR_NOT_FOUND') {
          return null;
        }
        throw error;
      }
    },
    enabled,
    retry: false,
  });
}

export function useTorVersion(leadId: string, versionNo: number | null) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.version(leadId, versionNo ?? 0),
    queryFn: () => request((token) => api.getVersion(token, leadId, versionNo ?? 0)),
    enabled: versionNo !== null,
  });
}

export function useTorDiff(leadId: string, from: number, to: number, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.diff(leadId, from, to),
    queryFn: () => request((token) => api.getDiff(token, leadId, from, to)),
    enabled,
  });
}

export function useTorActions(leadId: string) {
  const request = useAuthedRequest();
  const refresh = useRefreshLead(leadId);
  return {
    create: useMutation({
      mutationFn: (body: TorVersionInput) => request((token) => api.createTor(token, leadId, body)),
      onSuccess: refresh,
    }),
    saveDraft: useMutation({
      mutationFn: (body: TorVersionInput) => request((token) => api.saveDraft(token, leadId, body)),
      onSuccess: refresh,
    }),
    newVersion: useMutation({
      mutationFn: () => request((token) => api.newVersion(token, leadId)),
      onSuccess: refresh,
    }),
    approveDiscount: useMutation({
      mutationFn: () => request((token) => api.approveDiscount(token, leadId)),
      onSuccess: refresh,
    }),
    send: useMutation({
      mutationFn: () => request((token) => api.sendTor(token, leadId)),
      onSuccess: refresh,
    }),
    sign: useMutation({
      mutationFn: (input: { versionNo: number; body: SignTorRequest }) =>
        request((token) => api.signTor(token, leadId, input.versionNo, input.body)),
      onSuccess: refresh,
    }),
    downloadPdf: useMutation({
      mutationFn: (versionNo: number) =>
        request((token) => api.downloadTorPdf(token, leadId, versionNo)),
    }),
  };
}

export function useQuotations(leadId: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.quotations(leadId),
    queryFn: () => request((token) => api.listQuotations(token, leadId)),
    enabled,
  });
}

export function useQuotationActions(leadId: string) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: salesKeys.quotations(leadId) });
  return {
    fromTor: useMutation({
      mutationFn: (body: QuoteFromTorInput) =>
        request((token) => api.quoteFromTor(token, leadId, body)),
      onSuccess: refresh,
    }),
    quick: useMutation({
      mutationFn: (body: QuickQuoteInput) =>
        request((token) => api.quickQuote(token, leadId, body)),
      onSuccess: refresh,
    }),
    setStatus: useMutation({
      mutationFn: (input: { id: string; status: string }) =>
        request((token) => api.setQuotationStatus(token, leadId, input.id, input.status)),
      onSuccess: refresh,
    }),
    downloadPdf: useMutation({
      mutationFn: (id: string) => request((token) => api.downloadQuotationPdf(token, leadId, id)),
    }),
  };
}

export function useClientAccount(leadId: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.client(leadId),
    queryFn: async () => {
      try {
        return await request((token) => api.getClientByLead(token, leadId));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled,
    retry: false,
  });
}

export function usePipelineSummary(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.pipeline(),
    queryFn: () => request((token) => api.getPipelineSummary(token)),
    enabled,
  });
}

export function useCatalogue(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: salesKeys.catalogue(),
    queryFn: () => request((token) => api.listCatalogue(token)),
    enabled,
  });
}
