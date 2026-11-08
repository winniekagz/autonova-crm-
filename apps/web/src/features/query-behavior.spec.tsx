// @vitest-environment jsdom
import type { LeadDto } from '@autonova/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { resetNavigation } from '@/test/navigation';
import { DIRECTOR, ROLES, apiError, makeUser, mockApi, renderAs } from '@/test/render';
import { ClearCacheOnSignOut } from './auth/clear-cache-on-sign-out';
import { AuthContext, type AuthState } from './auth/auth-context';
import { EditLead } from './leads/lead-form';
import { LeadsList } from './leads/leads-list';
import { leadsKeys } from './leads/leads.queries';
import { UserList } from './users/user-list';
import { usersKeys } from './users/users.queries';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => resetNavigation('/'));
afterEach(() => vi.unstubAllGlobals());

const lead = (over: Partial<LeadDto> = {}): LeadDto => ({
  id: 'l-1',
  name: 'Achieng Otieno',
  companyName: null,
  phone: null,
  email: null,
  source: 'WEBSITE',
  referrerName: null,
  productInterest: null,
  notes: null,
  estimatedValue: null,
  currency: 'KES',
  stage: 'NEW_LEAD',
  lifecycle: { transitions: ['VISITS_AND_CALLS'], canDisqualify: true, canMarkLost: false },
  lostReason: null,
  lostAt: null,
  disqualificationReason: null,
  revisitOn: null,
  ownerUserId: 'u-1',
  ownerName: 'Dee',
  nextAction: 'Call',
  nextActionAt: '2026-11-10T09:00:00.000Z',
  probability: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});
const BD = {
  ...DIRECTOR,
  permissions: ['leads:list', 'leads:read', 'leads:create', 'leads:update'],
};
const usersPage = { body: { items: [makeUser()], page: 1, pageSize: 20, total: 1 } };

describe('shared roles are fetched once for the whole app', () => {
  it('two screens in a row reuse the cached role list', async () => {
    const { calls } = mockApi({
      'GET /users': () => usersPage,
      'GET /roles': () => ({ body: ROLES }),
    });
    const first = renderAs(DIRECTOR, <UserList />);
    await first.findByRole('option', { name: 'Finance' });
    first.unmount();

    // Same cache, new screen: the roles are still fresh, so nothing is requested again.
    const second = renderAs(DIRECTOR, <UserList />, first.queryClient);
    await second.findByRole('option', { name: 'Finance' });
    expect(calls.filter((c) => c.path === '/roles')).toHaveLength(1);
  });
});

describe('a list that was already seen is shown instantly, then refreshed', () => {
  it('revisiting a lead page paints the cached rows while it re-reads them', async () => {
    let version = 1;
    const { calls } = mockApi({
      'GET /leads': () => ({
        body: {
          items: [lead({ name: version === 1 ? 'Old Name' : 'New Name' })],
          page: 1,
          pageSize: 20,
          total: 1,
        },
      }),
    });
    const first = renderAs(BD, <LeadsList />);
    await first.findByRole('link', { name: 'Old Name' });
    first.unmount();

    version = 2;
    const second = renderAs(BD, <LeadsList />, first.queryClient);
    // Painted from the cache before the network answers...
    expect(screen.getByRole('link', { name: 'Old Name' })).toBeInTheDocument();
    // ...then corrected by the background refresh.
    expect(await second.findByRole('link', { name: 'New Name' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/leads')).toHaveLength(2);
  });
});

describe('failed reads: retry only what can pass on its own', () => {
  const realClient = () => createQueryClient({ retryDelay: 1 });

  it('retries a server fault once and then recovers', async () => {
    let attempts = 0;
    const { calls } = mockApi({
      'GET /users': () => (++attempts === 1 ? apiError(503, 'HTTP_ERROR') : usersPage),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />, realClient());
    expect(await screen.findByRole('list', { name: 'Users' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/users')).toHaveLength(2);
  });

  it('does not retry a permission refusal: one request, then the message', async () => {
    const { calls } = mockApi({
      'GET /users': () => apiError(403, 'FORBIDDEN'),
      'GET /roles': () => apiError(403, 'FORBIDDEN'),
    });
    renderAs(DIRECTOR, <UserList />, realClient());
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/users')).toHaveLength(1);
  });

  it('gives up after one retry and shows an error with a working "Try again"', async () => {
    const user = userEvent.setup();
    let healthy = false;
    const { calls } = mockApi({
      'GET /users': () => (healthy ? usersPage : apiError(500, 'INTERNAL_ERROR')),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />, realClient());
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(calls.filter((c) => c.path === '/users')).toHaveLength(2);

    healthy = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Users' })).toBeInTheDocument();
  });
});

describe('saving a lead', () => {
  it('refreshes the lists afterwards and never repeats a failed save on its own', async () => {
    const user = userEvent.setup();
    let saves = 0;
    const { calls } = mockApi({
      'GET /leads/l-1': () => ({ body: lead() }),
      'PATCH /leads/l-1': () =>
        ++saves === 1 ? apiError(500, 'INTERNAL_ERROR') : { body: lead() },
    });
    const { queryClient } = renderAs(
      BD,
      <EditLead id="l-1" />,
      createQueryClient({ retryDelay: 1 }),
    );
    await screen.findByRole('heading', { name: 'Update lead' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete the request');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(invalidate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Lead saved.')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: leadsKeys.lists() });
  });

  it('the edit form never opens on a stale cached copy: it waits for the server', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = createQueryClient({ retry: false });
    client.setQueryData(leadsKeys.detail('l-1'), lead({ name: 'Stale Name' }));

    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(lead({ name: 'Fresh Name' })), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAs(BD, <EditLead id="l-1" />, client);

    expect(screen.getByRole('status')).toHaveTextContent('Loading lead');
    expect(screen.queryByLabelText('Person name')).not.toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.getByLabelText('Person name')).toHaveValue('Fresh Name'));
  });
});

describe('cached data never outlives the session', () => {
  const state = (status: AuthState['status']): AuthState => ({
    status,
    me: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    expireSession: vi.fn(),
    retryRestore: vi.fn(),
    getAccessToken: async () => 't',
    renewAccessToken: async () => 't',
    reloadProfile: async () => DIRECTOR,
  });
  const mount = (status: AuthState['status']) => {
    const client = createQueryClient();
    client.setQueryData(usersKeys.roles, ROLES);
    client.setQueryData(leadsKeys.detail('l-1'), lead());
    const tree = (value: AuthState) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={value}>
          <ClearCacheOnSignOut />
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    const view = render(tree(state(status)));
    return { client, view, tree };
  };

  it('empties the cache when the session ends', () => {
    const { client, view, tree } = mount('authenticated');
    expect(client.getQueryCache().getAll()).toHaveLength(2);
    view.rerender(tree(state('unauthenticated')));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('keeps the cache while the server is merely unreachable', () => {
    const { client, view, tree } = mount('authenticated');
    view.rerender(tree(state('unavailable')));
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });

  it('does nothing while signed in or restoring', () => {
    const { client } = mount('restoring');
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });
});
