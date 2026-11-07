import type { LoginResponse, MeResponse } from '@autonova/contracts';
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

export const login = (email: string, password: string) =>
  apiRequest('/auth/login', parseLoginResponse, { method: 'POST', body: { email, password } });

export const getMe = (token: string) => apiRequest('/auth/me', parseMeResponse, { token });

export const logout = (token: string) => apiRequestVoid('/auth/logout', { method: 'POST', token });
