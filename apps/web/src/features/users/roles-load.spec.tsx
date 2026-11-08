// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation } from '@/test/navigation';
import { DIRECTOR, FINANCE, ROLES, apiError, makeUser, mockApi, renderAs } from '@/test/render';
import { UserDetail } from './user-detail';
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

const target = makeUser({ id: 'u-1', fullName: 'Wanjiru Kamau', roles: ['finance'] });
const usersPage = { items: [target], page: 1, pageSize: 20, total: 1 };

describe('a failed role request is reported, never shown as "no roles"', () => {
  it('user list: says the filter is unavailable, keeps the list, and retry recovers', async () => {
    const user = userEvent.setup();
    let rolesUp = false;
    const { calls } = mockApi({
      'GET /users': () => ({ body: usersPage }),
      'GET /roles': () => (rolesUp ? { body: ROLES } : apiError(500, 'INTERNAL_ERROR')),
    });
    renderAs(DIRECTOR, <UserList />);

    expect(await screen.findByText(/Role information could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/the role filter is unavailable/)).toBeInTheDocument();
    // The rest of the page is unaffected.
    expect(await screen.findByRole('list', { name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Finance' })).not.toBeInTheDocument();

    rolesUp = true;
    await user.click(screen.getByRole('button', { name: 'Try loading roles again' }));
    expect(await screen.findByRole('option', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.queryByText(/Role information could not be loaded/)).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/roles')).toHaveLength(2);
  });

  it('user list: a successful but EMPTY role list shows no error notice', async () => {
    mockApi({
      'GET /users': () => ({ body: usersPage }),
      'GET /roles': () => ({ body: [] }),
    });
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'All roles' })).toBeVisible());
    expect(screen.queryByText(/Role information could not be loaded/)).not.toBeInTheDocument();
  });

  it('user list: a user who may not list roles makes no role request and sees no notice', async () => {
    const { calls } = mockApi({ 'GET /users': () => ({ body: usersPage }) });
    renderAs({ ...DIRECTOR, permissions: ['users:list'] }, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    expect(calls.some((c) => c.path === '/roles')).toBe(false);
    expect(screen.queryByText(/Role information could not be loaded/)).not.toBeInTheDocument();
  });

  it('user detail: explains why roles cannot be changed, keeps the read-only roles, and retry recovers', async () => {
    const user = userEvent.setup();
    let rolesUp = false;
    mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => (rolesUp ? { body: ROLES } : apiError(500, 'INTERNAL_ERROR')),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);

    expect(await screen.findByText(/changing roles is unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wanjiru Kamau' })).toBeInTheDocument();
    expect(screen.getAllByText('Finance').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();

    rolesUp = true;
    await user.click(screen.getByRole('button', { name: 'Try loading roles again' }));
    expect(await screen.findByRole('button', { name: 'Save roles' })).toBeInTheDocument();
    expect(screen.queryByText(/changing roles is unavailable/)).not.toBeInTheDocument();
  });

  it('user detail: does not show the notice to someone who cannot assign roles anyway', async () => {
    mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => apiError(500, 'INTERNAL_ERROR'),
    });
    renderAs(
      { ...FINANCE, permissions: ['users:read', 'roles:list'] },
      <UserDetail userId="u-1" />,
    );
    await screen.findByRole('heading', { name: 'Wanjiru Kamau' });
    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    expect(screen.queryByText(/Role information could not be loaded/)).not.toBeInTheDocument();
  });
});
