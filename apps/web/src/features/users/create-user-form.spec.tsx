// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECTOR,
  FINANCE,
  ROLES,
  apiError,
  makeUser,
  mockApi,
  renderAs,
  requestUrl,
} from '@/test/render';
import { CreateUserForm } from './create-user-form';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Wanjiru Kamau');
  await user.type(screen.getByLabelText('Email'), 'wanjiru@autonova.test');
  await user.click(screen.getByRole('checkbox', { name: /Finance/ }));
}

describe('CreateUserForm', () => {
  it('shows field-level validation errors and sends nothing when the form is empty', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'GET /roles': () => ({ body: ROLES }) });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });

    await user.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(screen.getByLabelText('Full name')).toBeInvalid();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Select at least one role.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('has an accessible label on every field and a grouped role control', async () => {
    mockApi({ 'GET /roles': () => ({ body: ROLES }) });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('creates a user: sends exactly name, email and roles (never a status or password) and shows success', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /roles': () => ({ body: ROLES }),
      'POST /users': ({ body }) => ({
        status: 201,
        body: makeUser({
          id: 'new-1',
          status: 'INVITED',
          fullName: 'Wanjiru Kamau',
          roles: ['finance'],
          ...(body as object),
        }),
      }),
    });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Invitation email sent to wanjiru@autonova.test.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('expires in 48 hours');
    expect(screen.getByRole('status')).toHaveTextContent('can only be used once');
    expect(screen.getByRole('link', { name: 'View Wanjiru Kamau' })).toHaveAttribute(
      'href',
      '/users/new-1',
    );

    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      email: 'wanjiru@autonova.test',
      fullName: 'Wanjiru Kamau',
      roles: ['finance'],
    });
    expect(post?.auth).toBe('Bearer test-token');
  });

  it('shows duplicate-email feedback on the email field and keeps everything the user typed', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /roles': () => ({ body: ROLES }),
      'POST /users': () => apiError(409, 'EMAIL_ALREADY_REGISTERED'),
    });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(
      await screen.findByText('A user with this email address already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(screen.getByLabelText('Email')).toHaveValue('wanjiru@autonova.test');
    expect(screen.getByLabelText('Full name')).toHaveValue('Wanjiru Kamau');
    expect(screen.getByRole('checkbox', { name: /Finance/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeEnabled();
  });

  it('shows a general error for an unexpected failure and preserves input', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /roles': () => ({ body: ROLES }),
      'POST /users': () => apiError(500, 'INTERNAL_ERROR'),
    });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByLabelText('Full name')).toHaveValue('Wanjiru Kamau');
  });

  it('prevents double submission while the request is in flight', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = requestUrl(input).pathname;
        if (path.endsWith('/roles')) return new Response(JSON.stringify(ROLES));
        if (init?.method === 'POST') {
          posts++;
          await gate;
          return new Response(JSON.stringify(makeUser({ status: 'INVITED' })), { status: 201 });
        }
        throw new Error(`unexpected ${path}`);
      }),
    );
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    await fillValid(user);

    await user.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(await screen.findByRole('button', { name: 'Inviting…' })).toBeDisabled();
    await user.keyboard('{Enter}');
    release();
    await screen.findByRole('status');
    expect(posts).toBe(1);
  });

  it('shows permission-denied when the server refuses (403) after the form was submitted', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /roles': () => ({ body: ROLES }),
      'POST /users': () => apiError(403, 'FORBIDDEN'),
    });
    renderAs(DIRECTOR, <CreateUserForm />);
    await screen.findByRole('checkbox', { name: /Finance/ });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('shows access denied, and calls nothing, for a user without users:create', () => {
    const { calls } = mockApi({});
    renderAs(FINANCE, <CreateUserForm />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('keeps the form usable and explains when roles cannot be loaded', async () => {
    mockApi({ 'GET /roles': () => apiError(500, 'INTERNAL_ERROR') });
    renderAs(DIRECTOR, <CreateUserForm />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite user' })).toBeDisabled());
  });
});
