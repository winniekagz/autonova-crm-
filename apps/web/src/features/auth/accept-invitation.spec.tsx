// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi } from '@/test/render';
import { AcceptInvitation } from './accept-invitation';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const GOOD = 'a long and unusual passphrase';

function open(hash = '#token=abc123') {
  window.history.replaceState(null, '', `/accept-invitation${hash}`);
  return render(<AcceptInvitation />);
}
async function fill(user: ReturnType<typeof userEvent.setup>, pw = GOOD, confirm = pw) {
  await user.type(await screen.findByLabelText('New password'), pw);
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm);
}
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Set password and activate account' }));

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => vi.unstubAllGlobals());

describe('AcceptInvitation', () => {
  it('reads the token from the URL fragment and removes it from the address bar', async () => {
    open('#token=secret-token-value');
    await screen.findByLabelText('New password');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('secret-token-value');
  });

  it('activates the account with the token and exactly the typed password', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /auth/invitations/accept': () => ({ status: 204 }) });
    open('#token=tok-1');
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/Your account is active/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
    expect(calls[0]?.body).toEqual({ token: 'tok-1', password: GOOD });
    // The invitation call is public: no bearer token, no cookies.
    expect(calls[0]?.auth).toBeNull();
    expect(calls[0]?.credentials).toBe('omit');
  });

  it('shows the password-policy message and sends nothing for a weak password', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    open();
    await fill(user, 'short');
    await submit(user);
    expect(await screen.findByText('Must be at least 12 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInvalid();
    expect(calls).toHaveLength(0);
  });

  it('refuses a common password', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    open();
    await fill(user, 'password1234');
    await submit(user);
    expect(await screen.findByText('This password is too common')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('says so when the confirmation does not match, and keeps both fields', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    open();
    await fill(user, GOOD, `${GOOD}x`);
    await submit(user);
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInvalid();
    expect(screen.getByLabelText('New password')).toHaveValue(GOOD);
    expect(calls).toHaveLength(0);
  });

  it('does not trim the password: leading and trailing spaces are part of it', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /auth/invitations/accept': () => ({ status: 204 }) });
    open();
    await fill(user, `  ${GOOD}  `);
    await submit(user);
    await screen.findByText(/Your account is active/);
    expect(calls[0]?.body).toMatchObject({ password: `  ${GOOD}  ` });
  });

  it('explains a link without a token, and cannot be submitted', async () => {
    open('');
    expect(await screen.findByText(/missing its token/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set password and activate account' }),
    ).toBeDisabled();
  });

  it.each([
    ['INVITATION_INVALID', 400, /expired or was already used/],
    ['RATE_LIMITED', 429, /Too many attempts/],
    ['SOMETHING_ELSE', 500, /Could not activate this account/],
  ])('maps %s to a plain message and keeps the typed password', async (code, status, text) => {
    const user = userEvent.setup();
    mockApi({
      'POST /auth/invitations/accept': () => apiError(status, code, 'raw backend detail'),
    });
    open();
    await fill(user);
    await submit(user);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText('raw backend detail')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue(GOOD);
    expect(screen.getByRole('button', { name: 'Set password and activate account' })).toBeEnabled();
  });

  it('prevents a double submit while activating', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    open();
    await fill(user);
    await submit(user);
    const busy = await screen.findByRole('button', { name: 'Activating…' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByText(/Your account is active/)).toBeInTheDocument());
  });
});
