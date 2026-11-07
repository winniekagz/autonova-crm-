// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DIRECTOR, FINANCE, ROLES, apiError, makeUser, mockApi, renderAs } from '@/test/render';
import { UserDetail } from './user-detail';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom does not implement <dialog>.showModal()/close(); model the open attribute only.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());

const target = makeUser({ id: 'u-1', fullName: 'Wanjiru Kamau', roles: ['finance'] });

describe('UserDetail', () => {
  it('shows a loading state, then the user with status and roles as text', async () => {
    mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    expect(screen.getByRole('status', { name: 'Loading user' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Wanjiru Kamau' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Finance/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Director/ })).not.toBeChecked();
  });

  it('shows a not-found state for an unknown user', async () => {
    mockApi({
      'GET /users/u-1': () => apiError(404, 'USER_NOT_FOUND'),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    expect(await screen.findByText(/does not exist/)).toBeInTheDocument();
  });

  it('shows access denied for a user without users:read, with no API calls', () => {
    const { calls } = mockApi({});
    renderAs(FINANCE, <UserDetail userId="u-1" />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows access denied when the server answers 403', async () => {
    mockApi({
      'GET /users/u-1': () => apiError(403, 'FORBIDDEN'),
      'GET /roles': () => apiError(403, 'FORBIDDEN'),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('changes roles, sends only the role keys, and shows the saved result', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => ({ body: ROLES }),
      'PUT /users/u-1/roles': ({ body }) => ({
        body: { ...target, roles: (body as { roles: string[] }).roles.sort() },
      }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    await screen.findByRole('heading', { name: 'Wanjiru Kamau' });

    const save = screen.getByRole('button', { name: 'Save roles' });
    expect(save).toBeDisabled(); // nothing changed yet
    await user.click(screen.getByRole('checkbox', { name: /Technical Lead/ }));
    await user.click(save);

    expect(await screen.findByText(/Roles saved/)).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ roles: ['finance', 'technical_lead'] });
  });

  it('explains and blocks an attempt to change your own roles', async () => {
    mockApi({
      'GET /users/dir-1': () => ({
        body: makeUser({ id: 'dir-1', fullName: 'Dee Director', roles: ['director'] }),
      }),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserDetail userId="dir-1" />);
    await screen.findByRole('heading', { name: 'Dee Director' });
    expect(screen.getByText(/cannot change your own roles/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Finance/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save roles' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Disable Dee/ })).toBeDisabled();
  });

  it('surfaces a LAST_DIRECTOR refusal from the server as a clear message', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /users/u-9': () => ({
        body: makeUser({ id: 'u-9', fullName: 'Only Director', roles: ['director'] }),
      }),
      'GET /roles': () => ({ body: ROLES }),
      'PUT /users/u-9/roles': () => apiError(422, 'LAST_DIRECTOR'),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-9" />);
    await screen.findByRole('heading', { name: 'Only Director' });
    await user.click(screen.getByRole('checkbox', { name: /Finance/ }));
    await user.click(screen.getByRole('checkbox', { name: /Director/ }));
    await user.click(screen.getByRole('button', { name: 'Save roles' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('without an active Director');
  });

  it('will not submit an empty role set', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    await screen.findByRole('heading', { name: 'Wanjiru Kamau' });
    await user.click(screen.getByRole('checkbox', { name: /Finance/ }));
    await user.click(screen.getByRole('button', { name: 'Save roles' }));
    expect(screen.getByText('Select at least one role.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('renames a user and validates the name first', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /users/u-1': () => ({ body: target }),
      'GET /roles': () => ({ body: ROLES }),
      'PATCH /users/u-1': ({ body }) => ({ body: { ...target, ...(body as object) } }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    await screen.findByRole('heading', { name: 'Wanjiru Kamau' });

    const input = screen.getByLabelText('Full name');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await user.type(input, 'Wanjiru K. Kamau');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ fullName: 'Wanjiru K. Kamau' });
  });

  describe('disable (access-revoking action)', () => {
    it('requires confirmation, explains the consequence, and sends nothing until confirmed', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({
        'GET /users/u-1': () => ({ body: target }),
        'GET /roles': () => ({ body: ROLES }),
      });
      renderAs(DIRECTOR, <UserDetail userId="u-1" />);
      await screen.findByRole('heading', { name: 'Wanjiru Kamau' });

      await user.click(screen.getByRole('button', { name: 'Disable Wanjiru Kamau' }));
      const dialog = await screen.findByRole('dialog', { name: 'Disable Wanjiru Kamau?' });
      expect(
        within(dialog).getByText(/signed out of every session straight away/),
      ).toBeInTheDocument();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });

    it('disables on confirmation and shows the new status', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({
        'GET /users/u-1': () => ({ body: target }),
        'GET /roles': () => ({ body: ROLES }),
        'POST /users/u-1/disable': () => ({ body: { ...target, status: 'DISABLED' } }),
      });
      renderAs(DIRECTOR, <UserDetail userId="u-1" />);
      await screen.findByRole('heading', { name: 'Wanjiru Kamau' });

      await user.click(screen.getByRole('button', { name: 'Disable Wanjiru Kamau' }));
      const dialog = await screen.findByRole('dialog', { name: 'Disable Wanjiru Kamau?' });
      await user.click(within(dialog).getByRole('button', { name: 'Disable account' }));

      expect(await screen.findByText('Account disabled and sessions revoked.')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      // once disabled there is nothing left to disable
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /^Disable Wanjiru/ })).not.toBeInTheDocument(),
      );
    });

    it('shows the server’s refusal (last Director) and leaves the status unchanged', async () => {
      const user = userEvent.setup();
      mockApi({
        'GET /users/u-1': () => ({
          body: makeUser({ id: 'u-1', fullName: 'Sole Director', roles: ['director'] }),
        }),
        'GET /roles': () => ({ body: ROLES }),
        'POST /users/u-1/disable': () => apiError(422, 'LAST_DIRECTOR'),
      });
      renderAs(DIRECTOR, <UserDetail userId="u-1" />);
      await screen.findByRole('heading', { name: 'Sole Director' });
      await user.click(screen.getByRole('button', { name: 'Disable Sole Director' }));
      const dialog = await screen.findByRole('dialog', { name: 'Disable Sole Director?' });
      await user.click(within(dialog).getByRole('button', { name: 'Disable account' }));

      expect(await screen.findByText(/without an active Director/)).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('does not offer disabling to a user without users:disable', async () => {
      mockApi({
        'GET /users/u-1': () => ({ body: target }),
        'GET /roles': () => ({ body: ROLES }),
      });
      renderAs(
        { ...DIRECTOR, permissions: ['users:read', 'roles:list'] },
        <UserDetail userId="u-1" />,
      );
      await screen.findByRole('heading', { name: 'Wanjiru Kamau' });
      expect(screen.queryByRole('button', { name: /^Disable/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument();
      // roles render read-only
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByText('Finance')).toBeInTheDocument();
    });
  });

  it('tells the reader that an invited user cannot sign in yet', async () => {
    mockApi({
      'GET /users/u-1': () => ({ body: makeUser({ status: 'INVITED', lastLoginAt: null }) }),
      'GET /roles': () => ({ body: ROLES }),
    });
    renderAs(DIRECTOR, <UserDetail userId="u-1" />);
    await screen.findByText('Invited');
    expect(screen.getByText(/cannot sign in yet/)).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });
});
