import type { LeadDto, LeadInput, LeadStageHistoryDto, Paginated } from '@autonova/contracts';
import { LeadDisqualificationReason, LeadSource, LeadStage, enumValues } from '@autonova/enums';
import { apiRequest } from '@/lib/api-client';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseLead(value: unknown): LeadDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.source !== 'string' ||
    !enumValues(LeadSource).includes(value.source as LeadSource) ||
    typeof value.currency !== 'string' ||
    !['KES', 'USD'].includes(value.currency) ||
    typeof value.stage !== 'string' ||
    !enumValues(LeadStage).includes(value.stage as LeadStage) ||
    !isRecord(value.lifecycle) ||
    !Array.isArray(value.lifecycle.transitions) ||
    !value.lifecycle.transitions.every(
      (stage) => typeof stage === 'string' && enumValues(LeadStage).includes(stage as LeadStage),
    ) ||
    typeof value.lifecycle.canDisqualify !== 'boolean' ||
    typeof value.lifecycle.canMarkLost !== 'boolean' ||
    typeof value.ownerUserId !== 'string' ||
    typeof value.ownerName !== 'string' ||
    typeof value.nextAction !== 'string' ||
    typeof value.nextActionAt !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !(value.companyName === null || typeof value.companyName === 'string') ||
    !(value.phone === null || typeof value.phone === 'string') ||
    !(value.email === null || typeof value.email === 'string') ||
    !(value.referrerName === null || typeof value.referrerName === 'string') ||
    !(value.productInterest === null || typeof value.productInterest === 'string') ||
    !(value.notes === null || typeof value.notes === 'string') ||
    !(value.estimatedValue === null || typeof value.estimatedValue === 'string') ||
    !(value.probability === null || typeof value.probability === 'number') ||
    !(value.lostReason === null || typeof value.lostReason === 'string') ||
    !(value.lostAt === null || typeof value.lostAt === 'string') ||
    !(
      value.disqualificationReason === null ||
      (typeof value.disqualificationReason === 'string' &&
        enumValues(LeadDisqualificationReason).includes(
          value.disqualificationReason as LeadDisqualificationReason,
        ))
    ) ||
    !(value.revisitOn === null || typeof value.revisitOn === 'string')
  ) {
    throw new Error('Unexpected lead response from the server');
  }
  return value as unknown as LeadDto;
}

function parseHistoryItem(value: unknown): LeadStageHistoryDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.leadId !== 'string' ||
    !(
      value.fromStage === null ||
      (typeof value.fromStage === 'string' &&
        enumValues(LeadStage).includes(value.fromStage as LeadStage))
    ) ||
    typeof value.toStage !== 'string' ||
    !enumValues(LeadStage).includes(value.toStage as LeadStage) ||
    !(value.actorUserId === null || typeof value.actorUserId === 'string') ||
    !(value.actorName === null || typeof value.actorName === 'string') ||
    typeof value.occurredAt !== 'string' ||
    !(value.reason === null || typeof value.reason === 'string') ||
    !(
      value.disqualificationReason === null ||
      (typeof value.disqualificationReason === 'string' &&
        enumValues(LeadDisqualificationReason).includes(
          value.disqualificationReason as LeadDisqualificationReason,
        ))
    ) ||
    !(value.revisitOn === null || typeof value.revisitOn === 'string') ||
    !['MANUAL', 'SCHEDULED_REVISIT'].includes(String(value.source))
  ) {
    throw new Error('Unexpected lead history response from the server');
  }
  return value as unknown as LeadStageHistoryDto;
}

function parseHistoryPage(value: unknown): Paginated<LeadStageHistoryDto> {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    typeof value.total !== 'number' ||
    typeof value.page !== 'number' ||
    typeof value.pageSize !== 'number'
  ) {
    throw new Error('Unexpected lead history response from the server');
  }
  return {
    items: value.items.map(parseHistoryItem),
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
  };
}

function parsePage(json: unknown): Paginated<LeadDto> {
  if (
    !isRecord(json) ||
    !Array.isArray(json.items) ||
    typeof json.total !== 'number' ||
    typeof json.page !== 'number' ||
    typeof json.pageSize !== 'number'
  ) {
    throw new Error('Unexpected lead list response from the server');
  }
  return {
    items: json.items.map(parseLead),
    total: json.total,
    page: json.page,
    pageSize: json.pageSize,
  };
}

export function listLeads(token: string, q: string, page = 1) {
  const params = new URLSearchParams({ q: q.trim(), page: String(page), pageSize: '20' });
  if (!q.trim()) params.delete('q');
  return apiRequest(`/leads?${params}`, parsePage, { token });
}

export const getLead = (token: string, id: string) =>
  apiRequest(`/leads/${encodeURIComponent(id)}`, parseLead, { token });
export const createLead = (token: string, body: LeadInput) =>
  apiRequest('/leads', parseLead, { method: 'POST', body, token });
export const updateLead = (token: string, id: string, body: LeadInput) =>
  apiRequest(`/leads/${encodeURIComponent(id)}`, parseLead, { method: 'PATCH', body, token });

export const getLeadHistory = (token: string, id: string, page = 1) =>
  apiRequest(
    `/leads/${encodeURIComponent(id)}/history?page=${page}&pageSize=50`,
    parseHistoryPage,
    { token },
  );

export const transitionLead = (
  token: string,
  id: string,
  body: { fromStage: LeadDto['stage']; toStage: LeadDto['stage']; reason?: string },
) =>
  apiRequest(`/leads/${encodeURIComponent(id)}/transitions`, parseLead, {
    method: 'POST',
    body,
    token,
  });

export const disqualifyLead = (
  token: string,
  id: string,
  body: { fromStage: 'VISITS_AND_CALLS'; reason: string; revisitOn?: string },
) =>
  apiRequest(`/leads/${encodeURIComponent(id)}/disqualification`, parseLead, {
    method: 'POST',
    body,
    token,
  });

export const markLeadLost = (
  token: string,
  id: string,
  body: { fromStage: 'TOR_QUOTE_SENT'; reason: string },
) =>
  apiRequest(`/leads/${encodeURIComponent(id)}/lost`, parseLead, { method: 'POST', body, token });
