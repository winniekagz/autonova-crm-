import type { MeResponse, UserDto } from '@autonova/contracts';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/auth-context';

export const DIRECTOR: MeResponse = {
  id: 'dir-1',
  email: 'dir@autonova.test',
  fullName: 'Dee Director',
  roles: ['director'],
  permissions: [
    'roles:list',
    'users:assign_roles',
    'users:create',
    'users:disable',
    'users:list',
    'users:read',
    'users:update',
  ],
  mfa: { required: true, verified: true },
  restricted: false,
};

export const FINANCE: MeResponse = {
  id: 'fin-1',
  email: 'fin@autonova.test',
  fullName: 'Fin Ance',
  roles: ['finance'],
  permissions: [],
  mfa: { required: false, verified: false },
  restricted: false,
};

export function makeUser(over: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u-1',
    email: 'wanjiru@autonova.test',
    fullName: 'Wanjiru Kamau',
    status: 'ACTIVE',
    roles: ['finance'],
    lastLoginAt: '2026-11-01T08:00:00.000Z',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...over,
  };
}

export const ROLES = [
  { key: 'business_development', name: 'Business Development', description: 'Sales' },
  { key: 'director', name: 'Director / Administrator', description: 'Admin' },
  { key: 'finance', name: 'Finance', description: 'Billing' },
  { key: 'technical_lead', name: 'Technical Lead', description: 'Scope' },
];

export function renderAs(me: MeResponse | null, ui: ReactElement) {
  const expireSession = vi.fn();
  const value: AuthState = {
    status: me ? 'authenticated' : 'unauthenticated',
    me,
    signIn: vi.fn(),
    signOut: vi.fn(),
    expireSession,
    retryRestore: vi.fn(),
    getAccessToken: async () => 'test-token',
    renewAccessToken: async () => 'renewed-token',
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
  return { ...render(ui, { wrapper }), expireSession };
}

/** Resolves the three shapes fetch accepts without relying on implicit stringification. */
export function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

type Handler = (request: { url: URL; method: string; body: unknown; auth: string | null }) => {
  status?: number;
  body?: unknown;
};

/** Replaces global fetch with a router keyed by "METHOD /path"; unmatched calls fail the test. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: {
    method: string;
    path: string;
    body: unknown;
    auth: string | null;
    csrf: string | null;
    credentials: RequestCredentials | undefined;
  }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers = new Headers(init?.headers);
    const auth = headers.get('authorization');
    calls.push({
      method,
      path,
      body,
      auth,
      csrf: headers.get('x-autonova-csrf'),
      credentials: init?.credentials,
    });
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unexpected request: ${method} ${path}`);
    const { status = 200, body: responseBody } = handler({ url, method, body, auth });
    return new Response(responseBody === undefined ? null : JSON.stringify(responseBody), {
      status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

export const apiError = (status: number, code: string, message = code) => ({
  status,
  body: { statusCode: status, code, message, requestId: 'r', timestamp: 't', path: '/' },
});
