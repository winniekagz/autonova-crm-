// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation } from '@/test/navigation';
import { DIRECTOR, FINANCE, ROLES, apiError, makeUser, mockApi, renderAs } from '@/test/render';
import { UserList } from './user-list';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => resetNavigation('/users'));
afterEach(() => vi.unstubAllGlobals());

const page = (items: ReturnType<typeof makeUser>[], total = items.length) => ({
  status: 200,
  body: { items, page: 1, pageSize: 20, total },
});

describe('UserList', () => {
  it('shows a loading state, then users with role and status text (not colour alone)', async () => {
    mockApi({
      'GET /users': () =>
        page([
          makeUser(),
          makeUser({
            id: 'u-2',
            fullName: 'Otieno Ouma',
            email: 'o@autonova.test',
            status: 'INVITED',
            roles: ['director', 'finance'],
          }),
          makeUser({
            id: 'u-3',
            fullName: 'Kamau Njoroge',
            email: 'k@autonova.test',
            status: 'DISABLED',
          }),
        ]),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);

    expect(screen.getByRole('status', { name: 'Loading users' })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Users' });
    const card = within(list).getByText('Otieno Ouma').closest('li');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('Invited')).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText(/Director \/ Administrator, Finance/),
    ).toBeInTheDocument();
    expect(within(list).getByText('Active')).toBeInTheDocument();
    expect(within(list).getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invite user' })).toHaveAttribute('href', '/users/new');
  });

  it('sends the access token with the request', async () => {
    const { calls } = mockApi({
      'GET /users': () => page([makeUser()]),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    expect(calls.find((c) => c.path === '/users')?.auth).toBe('Bearer test-token');
  });

  it('shows an empty state with a next action when there are no users', async () => {
    mockApi({ 'GET /users': () => page([]), 'GET /roles': () => ({ body: ROLES }) });
    renderAs(DIRECTOR, <UserList />);
    expect(await screen.findByText('No users yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Invite user' }).length).toBeGreaterThan(0);
  });

  it('shows a filtered-empty message when a search matches nothing', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /users': ({ url }) => (url.searchParams.get('q') ? page([]) : page([makeUser()])),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });

    await user.type(screen.getByLabelText('Search'), 'zzz');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No users match your filters')).toBeInTheDocument();
  });

  it('sends search, status and role filters to the server (filtering happens in the database)', async () => {
    const user = userEvent.setup();
    const seen: URLSearchParams[] = [];
    mockApi({
      'GET /users': ({ url }) => {
        seen.push(url.searchParams);
        return page([makeUser()]);
      },
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    await screen.findByRole('option', { name: 'Finance' });

    await user.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');
    await user.selectOptions(screen.getByLabelText('Role'), 'finance');
    await user.type(screen.getByLabelText('Search'), '  wanj ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const last = seen.at(-1);
      expect(last?.get('q')).toBe('wanj'); // trimmed
      expect(last?.get('status')).toBe('ACTIVE');
      expect(last?.get('role')).toBe('finance');
      expect(last?.get('page')).toBe('1');
      expect(last?.get('pageSize')).toBe('20');
    });
    // The very first request carried no filters at all.
    expect(seen[0]?.has('q')).toBe(false);
    expect(seen[0]?.has('status')).toBe(false);
  });

  it('shows an error with a retry that works', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockApi({
      'GET /users': () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : page([makeUser()])),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Users' })).toBeInTheDocument();
  });

  it('shows permission-denied when the server answers 403, even if the UI thought it was allowed', async () => {
    mockApi({
      'GET /users': () => apiError(403, 'FORBIDDEN'),
      'GET /roles': () => apiError(403, 'FORBIDDEN'),
    });
    renderAs(DIRECTOR, <UserList />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('permission to view users');
  });

  it('makes no API call and shows access denied for a user without users:list', () => {
    const { calls } = mockApi({});
    renderAs(FINANCE, <UserList />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('drops the local session when the server says it is no longer valid (401)', async () => {
    mockApi({
      'GET /users': () => apiError(401, 'UNAUTHENTICATED'),
      'GET /roles': () => apiError(401, 'UNAUTHENTICATED'),
    });
    const { expireSession } = renderAs(DIRECTOR, <UserList />);
    await waitFor(() => expect(expireSession).toHaveBeenCalled());
  });

  it('pages through results using server-side pagination', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /users': ({ url }) => {
        const p = Number(url.searchParams.get('page'));
        return {
          body: {
            items: [makeUser({ id: `u-${p}`, fullName: `Person ${p}` })],
            page: p,
            pageSize: 20,
            total: 45,
          },
        };
      },
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserList />);
    expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/of\s*45 users/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/users').map((c) => c.method)).toEqual(['GET', 'GET']);
  });

  it('hides the invite action from a user who may list but not create', async () => {
    mockApi({ 'GET /users': () => page([makeUser()]) });
    renderAs({ ...DIRECTOR, permissions: ['users:list'] }, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    expect(screen.queryByRole('link', { name: 'Invite user' })).not.toBeInTheDocument();
  });
});
