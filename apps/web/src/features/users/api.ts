import type { Paginated, RoleDto, UserDto } from '@autonova/contracts';
import { UserStatus, enumValues } from '@autonova/enums';
import { apiRequest } from '@/lib/api-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const STATUSES: readonly string[] = enumValues(UserStatus);

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}

export function parseUser(json: unknown): UserDto {
  if (
    isRecord(json) &&
    typeof json.id === 'string' &&
    typeof json.email === 'string' &&
    typeof json.fullName === 'string' &&
    isUserStatus(json.status) &&
    Array.isArray(json.roles) &&
    json.roles.every((r): r is string => typeof r === 'string') &&
    (json.lastLoginAt === null || typeof json.lastLoginAt === 'string') &&
    typeof json.createdAt === 'string' &&
    typeof json.updatedAt === 'string'
  ) {
    return {
      id: json.id,
      email: json.email,
      fullName: json.fullName,
      status: json.status,
      roles: json.roles,
      lastLoginAt: json.lastLoginAt,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }
  throw new Error('Unexpected user response from the server');
}

export function parseUserPage(json: unknown): Paginated<UserDto> {
  if (
    isRecord(json) &&
    Array.isArray(json.items) &&
    typeof json.page === 'number' &&
    typeof json.pageSize === 'number' &&
    typeof json.total === 'number'
  ) {
    return {
      items: json.items.map(parseUser),
      page: json.page,
      pageSize: json.pageSize,
      total: json.total,
    };
  }
  throw new Error('Unexpected user list response from the server');
}

export function parseRoles(json: unknown): RoleDto[] {
  if (!Array.isArray(json)) throw new Error('Unexpected roles response from the server');
  return json.map((item) => {
    if (
      isRecord(item) &&
      typeof item.key === 'string' &&
      typeof item.name === 'string' &&
      (item.description === null || typeof item.description === 'string')
    ) {
      return { key: item.key, name: item.name, description: item.description };
    }
    throw new Error('Unexpected role in the server response');
  });
}

export interface UserListQuery {
  q?: string;
  status?: UserStatus | '';
  role?: string;
  page: number;
  pageSize: number;
}

export function listUsers(token: string, query: UserListQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.role) params.set('role', query.role);
  return apiRequest(`/users?${params}`, parseUserPage, { token });
}

export const getUser = (token: string, id: string) =>
  apiRequest(`/users/${encodeURIComponent(id)}`, parseUser, { token });

export const listRoles = (token: string) => apiRequest('/roles', parseRoles, { token });

export const createUser = (
  token: string,
  body: { email: string; fullName: string; roles: string[] },
) => apiRequest('/users', parseUser, { method: 'POST', body, token });

export const renameUser = (token: string, id: string, fullName: string) =>
  apiRequest(`/users/${encodeURIComponent(id)}`, parseUser, {
    method: 'PATCH',
    body: { fullName },
    token,
  });

export const changeUserRoles = (token: string, id: string, roles: string[], reason?: string) =>
  apiRequest(`/users/${encodeURIComponent(id)}/roles`, parseUser, {
    method: 'PUT',
    body: reason ? { roles, reason } : { roles },
    token,
  });

export const disableUser = (token: string, id: string, reason?: string) =>
  apiRequest(`/users/${encodeURIComponent(id)}/disable`, parseUser, {
    method: 'POST',
    body: reason ? { reason } : {},
    token,
  });
