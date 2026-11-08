// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DIRECTOR, mockApi, renderAs } from '@/test/render';
import { AuthContext, type AuthState } from './auth-context';
import { AppShell } from './app-shell';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const state = (over: Partial<AuthState>): AuthState => ({
  status: 'restoring',
  me: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  expireSession: vi.fn(),
  retryRestore: vi.fn(),
  getAccessToken: async () => 't',
  renewAccessToken: async () => 't',
  reloadProfile: async () => DIRECTOR,
  ...over,
});
const SECRET = 'SENSITIVE-CHILD-DATA';
const tree = (value: AuthState) => (
  <AuthContext.Provider value={value}>
    <AppShell>
      <p>{SECRET}</p>
    </AppShell>
  </AuthContext.Provider>
);

describe('AppShell: protected first render', () => {
  it('server-renders NO user data and NO page content before the session is proven', () => {
    // The initial server render always happens in the `restoring` state: the server has no access
    // token, and the refresh cookie is scoped to the API path, so it never reaches this server.
    const html = renderToString(tree(state({ status: 'restoring' })));
    expect(html).toContain('Checking your session');
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain('Dee Director');
    expect(html).not.toContain('dir@autonova.test');
    expect(html).not.toContain('Users');
  });

  it('does not render children while restoring, even in the browser', () => {
    render(tree(state({ status: 'restoring' })));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /login only when definitively signed out, and renders nothing sensitive', () => {
    replace.mockClear();
    render(tree(state({ status: 'unauthenticated' })));
    expect(replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('when the server cannot be reached it offers a retry and does NOT redirect to /login', async () => {
    replace.mockClear();
    const retryRestore = vi.fn();
    render(tree(state({ status: 'unavailable', retryRestore })));
    expect(screen.getByText('Could not check your session')).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retryRestore).toHaveBeenCalled();
  });

  it('renders content only once authenticated', () => {
    renderAs(
      DIRECTOR,
      <AppShell>
        <p>{SECRET}</p>
      </AppShell>,
    );
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/sessions');
  });

  it('shows the MFA screen instead of children for a restricted session', async () => {
    mockApi({ 'GET /auth/mfa/status': () => ({ body: { enrolled: false } }) });
    renderAs(
      { ...DIRECTOR, restricted: true, mfa: { required: true, verified: false } },
      <AppShell>
        <p>{SECRET}</p>
      </AppShell>,
    );
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Director two-factor verification')).toBeInTheDocument(),
    );
  });
});
