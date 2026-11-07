import type { LoginResponse, MeResponse, SessionDto } from '@autonova/contracts';
import { apiRequest, apiRequestVoid } from '@/lib/api-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseLoginResponse(json: unknown): LoginResponse {
  if (
    isRecord(json) &&
    typeof json.accessToken === 'string' &&
    json.tokenType === 'Bearer' &&
    typeof json.expiresIn === 'number' &&
    typeof json.mfaRequired === 'boolean'
  ) {
    return {
      accessToken: json.accessToken,
      tokenType: 'Bearer',
      expiresIn: json.expiresIn,
      mfaRequired: json.mfaRequired,
    };
  }
  throw new Error('Unexpected login response from the server');
}

export function parseMeResponse(json: unknown): MeResponse {
  if (
    isRecord(json) &&
    typeof json.id === 'string' &&
    typeof json.email === 'string' &&
    typeof json.fullName === 'string' &&
    isStringArray(json.roles) &&
    isStringArray(json.permissions) &&
    isRecord(json.mfa) &&
    typeof json.mfa.required === 'boolean' &&
    typeof json.mfa.verified === 'boolean' &&
    typeof json.restricted === 'boolean'
  ) {
    return {
      id: json.id,
      email: json.email,
      fullName: json.fullName,
      roles: json.roles,
      permissions: json.permissions,
      mfa: { required: json.mfa.required, verified: json.mfa.verified },
      restricted: json.restricted,
    };
  }
  throw new Error('Unexpected profile response from the server');
}

// Login, refresh and logout are the only calls that touch the HttpOnly refresh cookie.
export const login = (email: string, password: string) =>
  apiRequest('/auth/login', parseLoginResponse, {
    method: 'POST',
    body: { email, password },
    cookies: true,
  });

/** Exchanges the refresh cookie for a new access token. Called only by the SessionManager. */
export const refreshSession = () =>
  apiRequest('/auth/refresh', parseLoginResponse, { method: 'POST', cookies: true });

export const getMe = (token: string) => apiRequest('/auth/me', parseMeResponse, { token });

export const logout = (token: string) =>
  apiRequestVoid('/auth/logout', { method: 'POST', token, cookies: true });

function parseSession(json: unknown): SessionDto {
  if (
    isRecord(json) &&
    typeof json.id === 'string' &&
    typeof json.createdAt === 'string' &&
    typeof json.expiresAt === 'string' &&
    typeof json.current === 'boolean' &&
    (json.ip === null || typeof json.ip === 'string') &&
    (json.userAgent === null || typeof json.userAgent === 'string')
  ) {
    return {
      id: json.id,
      createdAt: json.createdAt,
      expiresAt: json.expiresAt,
      current: json.current,
      ip: json.ip,
      userAgent: json.userAgent,
    };
  }
  throw new Error('Unexpected session in the server response');
}

export function parseSessions(json: unknown): SessionDto[] {
  if (!Array.isArray(json)) throw new Error('Unexpected sessions response from the server');
  return json.map(parseSession);
}

export const listSessions = (token: string) =>
  apiRequest('/auth/sessions', parseSessions, { token });

/** Revoking the CURRENT session makes the API clear the refresh cookie, hence `cookies`. */
export const revokeSession = (token: string, sessionId: string) =>
  apiRequestVoid(`/auth/sessions/${sessionId}`, { method: 'DELETE', token, cookies: true });
