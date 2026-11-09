import type {
  CompanyDto,
  CompanyDuplicateCandidateDto,
  CompanyDuplicateCheckRequest,
  CompanyDuplicateCheckResult,
  CompanyLeadDto,
  CompanySaveRequest,
  ContactDto,
  ContactInput,
  Paginated,
} from '@autonova/contracts';
import { CompanyIndustry, LeadStage, enumValues } from '@autonova/enums';
import { apiRequest } from '@/lib/api-client';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const orNull = (v: unknown, type: 'string' | 'number') => v === null || typeof v === type;
const industries: readonly string[] = enumValues(CompanyIndustry);
const stages: readonly string[] = enumValues(LeadStage);

function parseCompany(value: unknown): CompanyDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !orNull(value.kraPin, 'string') ||
    !orNull(value.location, 'string') ||
    !(
      value.industry === null ||
      (typeof value.industry === 'string' && industries.includes(value.industry))
    ) ||
    !orNull(value.staffCount, 'number') ||
    !orNull(value.branchCount, 'number') ||
    !orNull(value.website, 'string') ||
    !Array.isArray(value.socialLinks) ||
    !value.socialLinks.every((link) => typeof link === 'string') ||
    typeof value.archived !== 'boolean' ||
    !orNull(value.createdByName, 'string') ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.contactCount !== 'number' ||
    typeof value.leadCount !== 'number'
  ) {
    throw new Error('Unexpected company response from the server');
  }
  return value as unknown as CompanyDto;
}

function parseContact(value: unknown): ContactDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.companyId !== 'string' ||
    typeof value.name !== 'string' ||
    !orNull(value.jobTitle, 'string') ||
    !orNull(value.phone, 'string') ||
    !orNull(value.email, 'string') ||
    !orNull(value.whatsappNumber, 'string') ||
    typeof value.isDecisionMaker !== 'boolean' ||
    !orNull(value.role, 'string') ||
    typeof value.archived !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Unexpected contact response from the server');
  }
  return value as unknown as ContactDto;
}

function parseCompanyLead(value: unknown): CompanyLeadDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.stage !== 'string' ||
    !stages.includes(value.stage) ||
    typeof value.ownerName !== 'string' ||
    !orNull(value.estimatedValue, 'string') ||
    (value.currency !== 'KES' && value.currency !== 'USD') ||
    typeof value.nextActionAt !== 'string'
  ) {
    throw new Error('Unexpected company lead response from the server');
  }
  return value as unknown as CompanyLeadDto;
}

function pageOf<T>(parseItem: (value: unknown) => T, what: string) {
  return (json: unknown): Paginated<T> => {
    if (
      !isRecord(json) ||
      !Array.isArray(json.items) ||
      typeof json.total !== 'number' ||
      typeof json.page !== 'number' ||
      typeof json.pageSize !== 'number'
    ) {
      throw new Error(`Unexpected ${what} response from the server`);
    }
    return {
      items: json.items.map(parseItem),
      total: json.total,
      page: json.page,
      pageSize: json.pageSize,
    };
  };
}

function parseCandidate(value: unknown): CompanyDuplicateCandidateDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !orNull(value.kraPin, 'string') ||
    !orNull(value.location, 'string') ||
    typeof value.archived !== 'boolean' ||
    !Array.isArray(value.matchedOn) ||
    !value.matchedOn.every((m) => m === 'KRA_PIN' || m === 'NAME')
  ) {
    throw new Error('Unexpected duplicate check response from the server');
  }
  return value as unknown as CompanyDuplicateCandidateDto;
}

function parseDuplicates(json: unknown): CompanyDuplicateCheckResult {
  if (
    !isRecord(json) ||
    !Array.isArray(json.exact) ||
    !Array.isArray(json.potential) ||
    typeof json.hiddenMatchCount !== 'number'
  ) {
    throw new Error('Unexpected duplicate check response from the server');
  }
  return {
    exact: json.exact.map(parseCandidate),
    potential: json.potential.map(parseCandidate),
    hiddenMatchCount: json.hiddenMatchCount,
  };
}

export interface CompanyListQuery {
  q: string;
  industry: string;
  page: number;
  includeArchived: boolean;
}

export function listCompanies(token: string, query: CompanyListQuery, pageSize = 20) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.industry) params.set('industry', query.industry);
  if (query.includeArchived) params.set('includeArchived', 'true');
  return apiRequest(`/companies?${params}`, pageOf(parseCompany, 'company list'), { token });
}

const path = (id: string) => `/companies/${encodeURIComponent(id)}`;
export const getCompany = (token: string, id: string) =>
  apiRequest(path(id), parseCompany, { token });
export const createCompany = (token: string, body: CompanySaveRequest) =>
  apiRequest('/companies', parseCompany, { method: 'POST', body, token });
export const updateCompany = (token: string, id: string, body: CompanySaveRequest) =>
  apiRequest(path(id), parseCompany, { method: 'PATCH', body, token });
export const archiveCompany = (token: string, id: string, reason?: string) =>
  apiRequest(`${path(id)}/archive`, parseCompany, {
    method: 'POST',
    body: reason ? { reason } : {},
    token,
  });
export const restoreCompany = (token: string, id: string) =>
  apiRequest(`${path(id)}/restore`, parseCompany, { method: 'POST', body: {}, token });
export const checkCompanyDuplicates = (token: string, body: CompanyDuplicateCheckRequest) =>
  apiRequest('/companies/duplicate-check', parseDuplicates, { method: 'POST', body, token });
export const listCompanyLeads = (token: string, id: string) =>
  apiRequest(
    `${path(id)}/leads?page=1&pageSize=20`,
    pageOf(parseCompanyLead, 'company lead list'),
    { token },
  );

export const listContacts = (token: string, companyId: string, includeArchived: boolean) =>
  apiRequest(
    `${path(companyId)}/contacts?page=1&pageSize=100${includeArchived ? '&includeArchived=true' : ''}`,
    pageOf(parseContact, 'contact list'),
    { token },
  );
export const createContact = (token: string, companyId: string, body: ContactInput) =>
  apiRequest(`${path(companyId)}/contacts`, parseContact, { method: 'POST', body, token });
export const updateContact = (token: string, id: string, body: Partial<ContactInput>) =>
  apiRequest(`/contacts/${encodeURIComponent(id)}`, parseContact, { method: 'PATCH', body, token });
export const archiveContact = (token: string, id: string, reason?: string) =>
  apiRequest(`/contacts/${encodeURIComponent(id)}/archive`, parseContact, {
    method: 'POST',
    body: reason ? { reason } : {},
    token,
  });
export const restoreContact = (token: string, id: string) =>
  apiRequest(`/contacts/${encodeURIComponent(id)}/restore`, parseContact, {
    method: 'POST',
    body: {},
    token,
  });
