import type {
  CompanyIndustry,
  LeadDisqualificationReason,
  LeadReminderReason,
  LeadReminderStatus,
  LeadSource,
  LeadStage,
  ProductInterest,
  UserStatus,
} from '@autonova/enums';

/** Standard error envelope returned by every API error response. */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. `VALIDATION_FAILED`, `NOT_FOUND`. */
  code: string;
  message: string;
  /** Field-level problems for validation failures. */
  details?: ApiErrorDetail[];
  requestId: string;
  timestamp: string;
  path: string;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** Standard envelope for paginated list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type HealthIndicatorStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  info?: Record<string, { status: HealthIndicatorStatus }>;
  error?: Record<string, { status: HealthIndicatorStatus; message?: string }>;
  details: Record<string, { status: HealthIndicatorStatus; message?: string }>;
}

/** `POST /auth/login` success body. The refresh token travels in an HttpOnly cookie, never here. */
export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /**
   * True when the user's roles require a second factor. Their session is then restricted: it can
   * only reach `/auth/me`, `/auth/logout` and the MFA endpoints until MFA is verified.
   */
  mfaRequired: boolean;
}

/** `POST /auth/refresh` success body: same shape as login. The rotated refresh token is in the cookie. */
export type RefreshResponse = LoginResponse;

export interface MfaStatusResponse {
  enrolled: boolean;
}
/** Returned only to the authenticated Director who started enrollment; never persisted in plaintext. */
export interface MfaEnrollmentResponse {
  secret: string;
  uri: string;
}
/** Recovery codes are displayed once after enrollment confirmation. */
export interface MfaEnrollmentConfirmedResponse {
  recoveryCodes: string[];
}

/** One live sign-in of the caller. Never carries token hashes or any credential. */
export interface SessionDto {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** True for the session that made this request. */
  current: boolean;
  /** Network address and browser the session was created from, for the owner to recognise it. */
  ip: string | null;
  userAgent: string | null;
}

/** `GET /auth/me`. Roles/permissions are the CURRENT server-side values, not token claims. */
export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  mfa: { required: boolean; verified: boolean };
  /** True while the session owes a second factor and can only reach the MFA endpoints. */
  restricted: boolean;
}

/** Safe view of a user. Never carries password hashes, sessions, MFA state or other credentials. */
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  /** Role keys, sorted. A user holds at least one role. */
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDto {
  key: string;
  name: string;
  description: string | null;
}

export interface LeadDto {
  id: string;
  name: string;
  /** The linked company's name; the original text for a lead that is not linked. */
  companyName: string | null;
  /** Linked company, or null for an individual prospect. */
  company: LeadCompanyRef | null;
  primaryContact: LeadContactRef | null;
  /** Other contacts involved in this deal (excludes the primary contact). */
  additionalContacts: LeadContactRef[];
  phone: string | null;
  email: string | null;
  source: LeadSource;
  referrerName: string | null;
  productInterest: ProductInterest | null;
  /** Free text entered before the catalogue existed; kept so nothing is lost, never written again. */
  legacyProductInterest: string | null;
  notes: string | null;
  estimatedValue: string | null;
  currency: 'KES' | 'USD';
  stage: LeadStage;
  lifecycle: LeadLifecycleOptions;
  lostReason: string | null;
  lostAt: string | null;
  disqualificationReason: LeadDisqualificationReason | null;
  revisitOn: string | null;
  ownerUserId: string;
  ownerName: string;
  nextAction: string;
  nextActionAt: string;
  probability: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCompanyRef {
  id: string;
  name: string;
  archived: boolean;
}

export interface LeadContactRef {
  id: string;
  name: string;
  jobTitle: string | null;
  archived: boolean;
}

/** Server-derived workflow options, independent of the caller's update permission. */
export interface LeadLifecycleOptions {
  transitions: LeadStage[];
  canDisqualify: boolean;
  canMarkLost: boolean;
}

export type LeadTransitionSource = 'MANUAL' | 'SCHEDULED_REVISIT';

export interface LeadStageHistoryDto {
  id: string;
  leadId: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  actorUserId: string | null;
  actorName: string | null;
  occurredAt: string;
  reason: string | null;
  disqualificationReason: LeadDisqualificationReason | null;
  revisitOn: string | null;
  source: LeadTransitionSource;
}

export interface LeadInput {
  name: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  referrerName?: string;
  /** Company to link on create. Use `LeadRelationshipsRequest` to change it later. */
  companyId?: string | null;
  /** Contacts to link on create; they must belong to `companyId`. */
  primaryContactId?: string | null;
  additionalContactIds?: string[];
  /** `null` clears the product; omit to leave it unchanged on update. */
  productInterest?: ProductInterest | null;
  notes?: string;
  estimatedValue?: string;
  currency: 'KES' | 'USD';
  nextAction: string;
  nextActionAt: string;
  probability?: number;
}

/** A create/update request. Set `acknowledgeDuplicates` after the user reviewed the matches. */
export interface LeadSaveRequest extends LeadInput {
  acknowledgeDuplicates?: boolean;
}

/** Changes which company and contacts a lead is linked to; the lead's other fields are untouched. */
export interface LeadRelationshipsRequest {
  /** `null` makes the lead an individual prospect. */
  companyId: string | null;
  primaryContactId: string | null;
  additionalContactIds: string[];
}

export interface LeadDuplicateCheckRequest {
  phone?: string;
  /** The lead being edited, so it is not reported as a duplicate of itself. */
  excludeLeadId?: string;
}

/** Only the phone number: several leads for one company are expected, so a shared company is not a duplicate. */
export type LeadDuplicateMatch = 'PHONE';

/** Only leads the caller may already read are listed. */
export interface LeadDuplicateCandidateDto {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  stage: LeadStage;
  ownerName: string;
  matchedOn: LeadDuplicateMatch[];
  createdAt: string;
}

export interface LeadDuplicateCheckResult {
  candidates: LeadDuplicateCandidateDto[];
  /** Matches in other people's pipelines: counted, never described. */
  hiddenMatchCount: number;
}

export interface LeadReminderDto {
  id: string;
  leadId: string;
  /** The follow-up instant this reminder is for. */
  dueAt: string;
  status: LeadReminderStatus;
  attempts: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  reason: LeadReminderReason | null;
  recipientName: string;
}

/** The status is not part of the request: new users are always created as INVITED. */
export interface CreateUserRequest {
  email: string;
  fullName: string;
  roles: string[];
}

export interface UpdateUserRequest {
  fullName: string;
}

export interface ChangeUserRolesRequest {
  roles: string[];
  reason?: string;
}

export interface DisableUserRequest {
  reason?: string;
}

export type CompanyDuplicateMatch = 'KRA_PIN' | 'NAME';

export interface CompanyDto {
  id: string;
  name: string;
  kraPin: string | null;
  location: string | null;
  industry: CompanyIndustry | null;
  staffCount: number | null;
  branchCount: number | null;
  website: string | null;
  socialLinks: string[];
  archived: boolean;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Counts only what the caller may see (BD: their own leads). */
  contactCount: number;
  leadCount: number;
}

export interface CompanyInput {
  name: string;
  kraPin?: string;
  location?: string;
  industry?: CompanyIndustry | null;
  staffCount?: number | null;
  branchCount?: number | null;
  website?: string;
  socialLinks?: string[];
}

export interface CompanySaveRequest extends CompanyInput {
  /** Set after the user reviewed possible name matches. A matching KRA PIN can never be bypassed. */
  acknowledgeDuplicates?: boolean;
}

export interface CompanyDuplicateCheckRequest {
  name?: string;
  kraPin?: string;
  excludeCompanyId?: string;
}

export interface CompanyDuplicateCandidateDto {
  id: string;
  name: string;
  kraPin: string | null;
  location: string | null;
  archived: boolean;
  matchedOn: CompanyDuplicateMatch[];
}

export interface CompanyDuplicateCheckResult {
  /** Same KRA PIN: the save is refused. */
  exact: CompanyDuplicateCandidateDto[];
  /** Same normalised name: the user may confirm. */
  potential: CompanyDuplicateCandidateDto[];
  hiddenMatchCount: number;
}

export interface ContactDto {
  id: string;
  companyId: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  whatsappNumber: string | null;
  isDecisionMaker: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  name: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  whatsappNumber?: string;
  isDecisionMaker: boolean;
}

/** A lead as shown on its company page: only fields a company screen needs. */
export interface CompanyLeadDto {
  id: string;
  name: string;
  stage: LeadStage;
  ownerName: string;
  estimatedValue: string | null;
  currency: 'KES' | 'USD';
  nextActionAt: string;
}
