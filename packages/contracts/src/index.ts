import type {
  LeadDisqualificationReason,
  LeadSource,
  LeadStage,
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
  companyName: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  referrerName: string | null;
  productInterest: string | null;
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
  companyName?: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  referrerName?: string;
  productInterest?: string;
  notes?: string;
  estimatedValue?: string;
  currency: 'KES' | 'USD';
  nextAction: string;
  nextActionAt: string;
  probability?: number;
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
