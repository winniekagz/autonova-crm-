'use client';

import type {
  CompanyDto,
  CompanyDuplicateCheckRequest,
  CompanySaveRequest,
  ContactDto,
  ContactInput,
  LeadRelationshipsRequest,
} from '@autonova/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import { setLeadRelationships } from '@/features/leads/api';
import { leadsKeys } from '@/features/leads/leads.queries';
import * as api from './api';

/** Cache keys for this feature. Everything starts with 'companies' so one call can clear it all. */
export const companiesKeys = {
  all: ['companies'] as const,
  lists: () => ['companies', 'list'] as const,
  list: (query: api.CompanyListQuery, pageSize: number) =>
    ['companies', 'list', { ...query, pageSize }] as const,
  detail: (id: string) => ['companies', 'detail', id] as const,
  contacts: (id: string, archived: boolean) => ['companies', 'contacts', id, archived] as const,
  allContacts: (id: string) => ['companies', 'contacts', id] as const,
  leads: (id: string) => ['companies', 'leads', id] as const,
};

export function useCompaniesList(query: api.CompanyListQuery, enabled: boolean, pageSize = 20) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: companiesKeys.list(query, pageSize),
    queryFn: () => request((token) => api.listCompanies(token, query, pageSize)),
    enabled,
  });
}

export function useCompanyQuery(id: string, enabled = true) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: companiesKeys.detail(id),
    queryFn: () => request((token) => api.getCompany(token, id)),
    enabled,
  });
}

export function useCompanyContacts(id: string, includeArchived: boolean, enabled = true) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: companiesKeys.contacts(id, includeArchived),
    queryFn: () => request((token) => api.listContacts(token, id, includeArchived)),
    enabled,
  });
}

export function useCompanyLeads(id: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: companiesKeys.leads(id),
    queryFn: () => request((token) => api.listCompanyLeads(token, id)),
    enabled,
  });
}

/** Asks the server for possible duplicates; the form calls `mutate` when the user leaves a field. */
export function useCheckCompanyDuplicates() {
  const request = useAuthedRequest();
  return useMutation({
    mutationFn: (body: CompanyDuplicateCheckRequest) =>
      request((token) => api.checkCompanyDuplicates(token, body)),
  });
}

function useAfterCompanyWrite() {
  const queryClient = useQueryClient();
  return (company: CompanyDto) => {
    queryClient.setQueryData(companiesKeys.detail(company.id), company);
    void queryClient.invalidateQueries({ queryKey: companiesKeys.lists() });
    // A lead shows its company's name, so renaming or archiving changes what leads display.
    void queryClient.invalidateQueries({ queryKey: leadsKeys.all });
  };
}

/** Creates a company, or updates `company` when one is given. */
export function useSaveCompany(company: CompanyDto | undefined) {
  const request = useAuthedRequest();
  const after = useAfterCompanyWrite();
  return useMutation({
    mutationFn: (body: CompanySaveRequest) =>
      request((token) =>
        company ? api.updateCompany(token, company.id, body) : api.createCompany(token, body),
      ),
    onSuccess: after,
  });
}

export function useArchiveCompany(id: string) {
  const request = useAuthedRequest();
  const after = useAfterCompanyWrite();
  return useMutation({
    mutationFn: (input: { archive: boolean; reason?: string }) =>
      request((token) =>
        input.archive ? api.archiveCompany(token, id, input.reason) : api.restoreCompany(token, id),
      ),
    onSuccess: after,
  });
}

function useAfterContactWrite(companyId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: companiesKeys.allContacts(companyId) });
    void queryClient.invalidateQueries({ queryKey: companiesKeys.detail(companyId) });
    void queryClient.invalidateQueries({ queryKey: companiesKeys.lists() });
  };
}

/** Adds a contact to `companyId`, or edits `contact` when one is given. */
export function useSaveContact(companyId: string, contact: ContactDto | undefined) {
  const request = useAuthedRequest();
  const after = useAfterContactWrite(companyId);
  return useMutation({
    mutationFn: (body: ContactInput) =>
      request((token) =>
        contact
          ? api.updateContact(token, contact.id, body)
          : api.createContact(token, companyId, body),
      ),
    onSuccess: after,
  });
}

export function useArchiveContact(companyId: string) {
  const request = useAuthedRequest();
  const after = useAfterContactWrite(companyId);
  return useMutation({
    mutationFn: (input: { id: string; archive: boolean; reason?: string }) =>
      request((token) =>
        input.archive
          ? api.archiveContact(token, input.id, input.reason)
          : api.restoreContact(token, input.id),
      ),
    onSuccess: after,
  });
}

/** Links a lead to a company and contacts. Both the lead and the company pages show the link. */
export function useSetLeadRelationships(leadId: string) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadRelationshipsRequest) =>
      request((token) => setLeadRelationships(token, leadId, body)),
    onSuccess: (lead) => {
      queryClient.setQueryData(leadsKeys.detail(lead.id), lead);
      void queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: companiesKeys.all });
    },
  });
}
