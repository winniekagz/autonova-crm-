// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi } from '@/test/render';
import { AuthProvider, useAuth } from './auth-context';
import { useAuthedRequest } from './use-authed-request';
import { apiRequest } from '@/lib/api-client';

const ME = {
  id: 'u-1',
  email: 'wanjiru@autonova.test',
  fullName: 'Wanjiru Kamau',
  roles: ['finance'],
  permissions: [],
  mfa: { required: false, verified: false },
  restricted: false,
};
const tokens = (accessToken: string) => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 900,
  mfaRequired: false,
});

function Probe() {
  const { status, me, signIn, signOut, retryRestore } = useAuth();
  const request = useAuthedRequest();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="me">{me?.fullName ?? 'nobody'}</p>
      <button onClick={() => void signIn('a@b.co', 'pw').catch(() => undefined)}>sign in</button>
      <button onClick={() => void signOut().catch(() => undefined)}>sign out</button>
      <button onClick={retryRestore}>retry</button>
      <button
        onClick={() =>
          void Promise.allSettled([
            request((t) => apiRequest('/ping', (j) => j, { token: t })),
            request((t) => apiRequest('/ping', (j) => j, { token: t })),
            request((t) => apiRequest('/ping', (j) => j, { token: t })),
          ])
        }
      >
        ping x3
      </button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
const status = () => screen.getByTestId('status').textContent;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider: persistent login', () => {
  it('restores the session after a reload from the refresh cookie alone', async () => {
    const { calls } = mockApi({
      'POST /auth/refresh': () => ({ body: tokens('restored-token') }),
      'GET /auth/me': () => ({ body: ME }),
    });
    renderProbe();

    expect(status()).toBe('restoring');
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(screen.getByTestId('me')).toHaveTextContent('Wanjiru Kamau');

    const refresh = calls.find((c) => c.path === '/auth/refresh');
    expect(refresh).toMatchObject({
      method: 'POST',
      credentials: 'include',
      csrf: '1',
      auth: null,
    });
    expect(calls.find((c) => c.path === '/auth/me')?.auth).toBe('Bearer restored-token');
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('never persists any token in web storage', async () => {
    mockApi({
      'POST /auth/refresh': () => ({ body: tokens('secret-access-token') }),
      'GET /auth/me': () => ({ body: ME }),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('secret-access-token');
    expect(document.body.innerHTML).not.toContain('secret-access-token');
  });

  it('shows signed-out state when the refresh is rejected, and does not loop', async () => {
    const { calls } = mockApi({
      'POST /auth/refresh': () => apiError(401, 'REFRESH_TOKEN_INVALID'),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('unauthenticated'));
    expect(screen.getByTestId('me')).toHaveTextContent('nobody');
    // Give any (incorrect) retry loop time to show itself.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    expect(calls.some((c) => c.path === '/auth/me')).toBe(false);
  });

  it('a network failure is "unavailable", not signed out, and retry recovers', async () => {
    const user = userEvent.setup();
    let online = false;
    mockApi({
      'POST /auth/refresh': () => {
        if (!online) throw new TypeError('offline');
        return { body: tokens('t') };
      },
      'GET /auth/me': () => ({ body: ME }),
    });
    // mockApi's handler throwing inside fetch behaves like a network failure.
    renderProbe();
    await waitFor(() => expect(status()).toBe('unavailable'));

    online = true;
    await user.click(screen.getByText('retry'));
    await waitFor(() => expect(status()).toBe('authenticated'));
  });

  it('a server error while restoring is "unavailable" (the cookie may still be valid)', async () => {
    mockApi({ 'POST /auth/refresh': () => apiError(503, 'HTTP_ERROR') });
    renderProbe();
    await waitFor(() => expect(status()).toBe('unavailable'));
  });
});

describe('AuthProvider: sign-in and sign-out', () => {
  it('sign-in sends credentials+CSRF and loads the profile', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /auth/refresh': () => apiError(401, 'REFRESH_TOKEN_INVALID'),
      'POST /auth/login': () => ({ body: tokens('login-token') }),
      'GET /auth/me': () => ({ body: ME }),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('unauthenticated'));
    await user.click(screen.getByText('sign in'));
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(calls.find((c) => c.path === '/auth/login')).toMatchObject({
      credentials: 'include',
      csrf: '1',
    });
    expect(calls.find((c) => c.path === '/auth/me')?.auth).toBe('Bearer login-token');
  });

  it('sign-out clears local state immediately, revokes on the server and never refreshes after', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /auth/refresh': () => ({ body: tokens('t1') }),
      'GET /auth/me': () => ({ body: ME }),
      'POST /auth/logout': () => ({ status: 204 }),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('sign out'));

    expect(status()).toBe('unauthenticated');
    expect(screen.getByTestId('me')).toHaveTextContent('nobody');
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/logout')).toBe(true));
    const logout = calls.find((c) => c.path === '/auth/logout');
    expect(logout).toMatchObject({
      method: 'POST',
      auth: 'Bearer t1',
      credentials: 'include',
      csrf: '1',
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });
});

describe('AuthProvider + useAuthedRequest', () => {
  it('multiple requests that all hit an expired token share ONE refresh and each succeed', async () => {
    const user = userEvent.setup();
    let refreshes = 0;
    const { calls } = mockApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return { body: tokens(refreshes === 1 ? 'old-token' : 'new-token') };
      },
      'GET /auth/me': () => ({ body: ME }),
      'GET /ping': ({ auth }) =>
        auth === 'Bearer old-token' ? apiError(401, 'TOKEN_EXPIRED') : { body: { ok: true } },
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('ping x3'));

    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/ping' && c.auth === 'Bearer new-token')).toHaveLength(
        3,
      ),
    );
    expect(refreshes).toBe(2); // 1 on startup + exactly 1 for the three expired requests
    expect(status()).toBe('authenticated');
  });

  it('a revoked session (401 UNAUTHENTICATED) signs out without trying to refresh', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /auth/refresh': () => ({ body: tokens('t') }),
      'GET /auth/me': () => ({ body: ME }),
      'GET /ping': () => apiError(401, 'UNAUTHENTICATED'),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('ping x3'));
    await waitFor(() => expect(status()).toBe('unauthenticated'));
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('MFA_REQUIRED is a 403: no refresh, no sign-out', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /auth/refresh': () => ({ body: tokens('t') }),
      'GET /auth/me': () => ({ body: ME }),
      'GET /ping': () => apiError(403, 'MFA_REQUIRED'),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('ping x3'));
    await waitFor(() => expect(calls.filter((c) => c.path === '/ping')).toHaveLength(3));
    expect(status()).toBe('authenticated');
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('a refresh rejected mid-session signs the user out and does not retry the refresh', async () => {
    const user = userEvent.setup();
    let refreshes = 0;
    const { calls } = mockApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return refreshes === 1 ? { body: tokens('t') } : apiError(401, 'REFRESH_TOKEN_INVALID');
      },
      'GET /auth/me': () => ({ body: ME }),
      'GET /ping': () => apiError(401, 'TOKEN_EXPIRED'),
    });
    renderProbe();
    await waitFor(() => expect(status()).toBe('authenticated'));
    await user.click(screen.getByText('ping x3'));
    await waitFor(() => expect(status()).toBe('unauthenticated'));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(2);
  });
});
