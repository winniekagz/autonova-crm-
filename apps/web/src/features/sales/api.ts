import type {
  CatalogueItemDto,
  ClientAccountDto,
  LeadDto,
  Paginated,
  PipelineSummaryDto,
  QualificationDto,
  QualificationInput,
  QualificationSettingsDto,
  QualifyRequest,
  QuickQuoteInput,
  QuoteFromTorInput,
  QuotationDto,
  SignTorRequest,
  TorDto,
  TorVersionDiffDto,
  TorVersionDto,
  TorVersionInput,
} from '@autonova/contracts';
import { apiDownload, apiRequest } from '@/lib/api-client';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown) => typeof v === 'string';
const orNull = (v: unknown) => v === null || typeof v === 'string';

/** Each parser checks only what the screens depend on, so a server/contract mismatch fails loudly here. */
export function parseQualification(value: unknown): QualificationDto {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !isRecord(value.ratings) ||
    typeof value.score !== 'number' ||
    typeof value.passMark !== 'number' ||
    typeof value.passed !== 'boolean' ||
    !str(value.assessedAt)
  ) {
    throw new Error('Unexpected qualification response from the server');
  }
  return value as unknown as QualificationDto;
}

function parseNullableQualification(value: unknown): QualificationDto | null {
  return value === null ? null : parseQualification(value);
}

function parseSettings(value: unknown): QualificationSettingsDto {
  if (
    !isRecord(value) ||
    typeof value.passMark !== 'number' ||
    !isRecord(value.weights) ||
    typeof value.isDefault !== 'boolean'
  ) {
    throw new Error('Unexpected settings response from the server');
  }
  return value as unknown as QualificationSettingsDto;
}

export function parseVersion(value: unknown): TorVersionDto {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    typeof value.versionNo !== 'number' ||
    !str(value.status) ||
    !str(value.currency) ||
    !isRecord(value.totals) ||
    !str(value.totals.totalOneOff) ||
    !Array.isArray(value.scopeItems) ||
    !Array.isArray(value.addons) ||
    !Array.isArray(value.milestones) ||
    !Array.isArray(value.signatures) ||
    typeof value.discountNeedsApproval !== 'boolean'
  ) {
    throw new Error('Unexpected Terms of Reference response from the server');
  }
  return value as unknown as TorVersionDto;
}

export function parseTor(value: unknown): TorDto {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !str(value.number) ||
    !Array.isArray(value.versions) ||
    typeof value.signed !== 'boolean' ||
    !orNull(value.clientAccountId)
  ) {
    throw new Error('Unexpected Terms of Reference response from the server');
  }
  parseVersion(value.current);
  return value as unknown as TorDto;
}

function parseDiff(value: unknown): TorVersionDiffDto {
  if (!isRecord(value) || !Array.isArray(value.scope) || !Array.isArray(value.commercial)) {
    throw new Error('Unexpected comparison response from the server');
  }
  return value as unknown as TorVersionDiffDto;
}

export interface SignOutcome {
  version: TorVersionDto;
  clientAccount: ClientAccountDto | null;
  converted: boolean;
}

function parseSignOutcome(value: unknown): SignOutcome {
  if (!isRecord(value) || typeof value.converted !== 'boolean') {
    throw new Error('Unexpected signature response from the server');
  }
  parseVersion(value.version);
  return value as unknown as SignOutcome;
}

export function parseQuotation(value: unknown): QuotationDto {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !str(value.number) ||
    !str(value.status) ||
    !str(value.validUntil) ||
    typeof value.expired !== 'boolean' ||
    !isRecord(value.totals) ||
    !Array.isArray(value.lines)
  ) {
    throw new Error('Unexpected quotation response from the server');
  }
  return value as unknown as QuotationDto;
}

function parseQuotations(value: unknown): Paginated<QuotationDto> {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total !== 'number') {
    throw new Error('Unexpected quotation list response from the server');
  }
  value.items.forEach(parseQuotation);
  return value as unknown as Paginated<QuotationDto>;
}

function parseClient(value: unknown): ClientAccountDto {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !str(value.number) ||
    !Array.isArray(value.milestones)
  ) {
    throw new Error('Unexpected client account response from the server');
  }
  return value as unknown as ClientAccountDto;
}

function parseSummary(value: unknown): PipelineSummaryDto {
  if (
    !isRecord(value) ||
    !Array.isArray(value.stages) ||
    typeof value.overdueFollowUps !== 'number' ||
    typeof value.torsAwaitingSignature !== 'number'
  ) {
    throw new Error('Unexpected pipeline response from the server');
  }
  return value as unknown as PipelineSummaryDto;
}

const lead = (id: string) => `/leads/${encodeURIComponent(id)}`;
const tor = (id: string) => `${lead(id)}/tor`;
const quotes = (id: string) => `${lead(id)}/quotations`;

// --- qualification
export const getQualification = (token: string, leadId: string) =>
  apiRequest(`${lead(leadId)}/qualification`, parseNullableQualification, { token });
export const assess = (token: string, leadId: string, body: QualificationInput) =>
  apiRequest(`${lead(leadId)}/qualification`, parseQualification, { method: 'POST', body, token });
export const qualify = (token: string, leadId: string, body: QualifyRequest) =>
  apiRequest(`${lead(leadId)}/qualify`, (json) => json as LeadDto, {
    method: 'POST',
    body: { fromStage: 'VISITS_AND_CALLS', ...body },
    token,
  });
export const getQualificationSettings = (token: string) =>
  apiRequest('/settings/qualification', parseSettings, { token });

// --- terms of reference
export const getTor = (token: string, leadId: string) =>
  apiRequest(tor(leadId), parseTor, { token });
export const createTor = (token: string, leadId: string, body: TorVersionInput) =>
  apiRequest(tor(leadId), parseTor, { method: 'POST', body, token });
export const saveDraft = (token: string, leadId: string, body: TorVersionInput) =>
  apiRequest(`${tor(leadId)}/draft`, parseVersion, { method: 'PUT', body, token });
export const newVersion = (token: string, leadId: string) =>
  apiRequest(`${tor(leadId)}/versions`, parseVersion, { method: 'POST', body: {}, token });
export const getVersion = (token: string, leadId: string, versionNo: number) =>
  apiRequest(`${tor(leadId)}/versions/${versionNo}`, parseVersion, { token });
export const getDiff = (token: string, leadId: string, from: number, to: number) =>
  apiRequest(`${tor(leadId)}/versions/${from}/diff/${to}`, parseDiff, { token });
export const approveDiscount = (token: string, leadId: string) =>
  apiRequest(`${tor(leadId)}/approve-discount`, parseVersion, { method: 'POST', body: {}, token });
export const sendTor = (token: string, leadId: string) =>
  apiRequest(`${tor(leadId)}/send`, parseVersion, { method: 'POST', body: {}, token });
export const signTor = (token: string, leadId: string, versionNo: number, body: SignTorRequest) =>
  apiRequest(`${tor(leadId)}/versions/${versionNo}/sign`, parseSignOutcome, {
    method: 'POST',
    body,
    token,
  });
export const downloadTorPdf = (token: string, leadId: string, versionNo: number) =>
  apiDownload(`${tor(leadId)}/versions/${versionNo}/pdf`, token);

// --- quotations
export const listQuotations = (token: string, leadId: string) =>
  apiRequest(`${quotes(leadId)}?page=1&pageSize=50`, parseQuotations, { token });
export const quoteFromTor = (token: string, leadId: string, body: QuoteFromTorInput) =>
  apiRequest(`${quotes(leadId)}/from-tor`, parseQuotation, { method: 'POST', body, token });
export const quickQuote = (token: string, leadId: string, body: QuickQuoteInput) =>
  apiRequest(`${quotes(leadId)}/quick`, parseQuotation, { method: 'POST', body, token });
export const setQuotationStatus = (token: string, leadId: string, id: string, status: string) =>
  apiRequest(`${quotes(leadId)}/${encodeURIComponent(id)}/status`, parseQuotation, {
    method: 'POST',
    body: { status },
    token,
  });
export const downloadQuotationPdf = (token: string, leadId: string, id: string) =>
  apiDownload(`${quotes(leadId)}/${encodeURIComponent(id)}/pdf`, token);

// --- catalogue
function parseCatalogue(value: unknown): Paginated<CatalogueItemDto> {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total !== 'number') {
    throw new Error('Unexpected catalogue response from the server');
  }
  return value as unknown as Paginated<CatalogueItemDto>;
}
export const listCatalogue = (token: string) =>
  apiRequest('/catalogue?page=1&pageSize=100', parseCatalogue, { token });

// --- clients and pipeline
export const getClientByLead = (token: string, leadId: string) =>
  apiRequest(`/clients/by-lead/${encodeURIComponent(leadId)}`, parseClient, { token });
export const getPipelineSummary = (token: string) =>
  apiRequest('/pipeline/summary', parseSummary, { token });
