// @vitest-environment jsdom
import type { MeResponse } from '@autonova/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { DIRECTOR } from '@/test/render';
import { AuthContext, type AuthState } from './auth-context';
import { LoginForm } from './login-form';

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const signIn = vi.fn<(email: string, password: string) => Promise<MeResponse>>();
const state = (over: Partial<AuthState> = {}): AuthState => ({
  status: 'unauthenticated',
  me: null,
  signIn,
  signOut: vi.fn(),
  expireSession: vi.fn(),
  retryRestore: vi.fn(),
  getAccessToken: async () => 't',
  renewAccessToken: async () => 't',
  reloadProfile: async () => DIRECTOR,
  ...over,
});
const renderForm = (over: Partial<AuthState> = {}) =>
  render(
    <AuthContext.Provider value={state(over)}>
      <LoginForm />
    </AuthContext.Provider>,
  );

beforeEach(() => {
  signIn.mockReset();
  router.replace.mockClear();
});

describe('LoginForm', () => {
  it('shows field errors and calls nothing when the form is empty', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed email without sending it', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in with the normalised email and goes to the app', async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue(DIRECTOR);
    renderForm();
    await user.type(screen.getByLabelText('Email'), '  Dee@Autonova.TEST ');
    await user.type(screen.getByLabelText('Password'), 'a-password-with-spaces ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    // The password is sent exactly as typed (never trimmed); the email is cleaned up.
    expect(signIn).toHaveBeenCalledWith('dee@autonova.test', 'a-password-with-spaces ');
  });

  it('does not apply the password policy: a short old password is still accepted', async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue(DIRECTOR);
    renderForm();
    await user.type(screen.getByLabelText('Email'), 'dee@autonova.test');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('dee@autonova.test', 'x'));
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'Invalid email or password.'],
    ['RATE_LIMITED', 429, 'Too many attempts. Wait a minute and try again.'],
    ['SOMETHING_ELSE', 500, 'Something went wrong signing you in. Please try again.'],
  ])(
    'maps %s to a plain message, keeps the email and clears the password',
    async (code, status, text) => {
      const user = userEvent.setup();
      signIn.mockRejectedValue(new ApiError(status, code, 'raw backend detail'));
      renderForm();
      await user.type(screen.getByLabelText('Email'), 'dee@autonova.test');
      await user.type(screen.getByLabelText('Password'), 'wrong-password');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      const alert = await screen.findByText(text);
      expect(alert).toBeInTheDocument();
      expect(screen.queryByText('raw backend detail')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toHaveValue('dee@autonova.test');
      expect(screen.getByLabelText('Password')).toHaveValue('');
      expect(router.replace).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    },
  );

  it('shows the network message as is', async () => {
    const user = userEvent.setup();
    signIn.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
    renderForm();
    await user.type(screen.getByLabelText('Email'), 'dee@autonova.test');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
  });

  it('prevents a double submit while signing in', async () => {
    const user = userEvent.setup();
    let finish: (me: MeResponse) => void = () => undefined;
    signIn.mockReturnValue(new Promise<MeResponse>((resolve) => (finish = resolve)));
    renderForm();
    await user.type(screen.getByLabelText('Email'), 'dee@autonova.test');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const busy = await screen.findByRole('button', { name: 'Signing in…' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(signIn).toHaveBeenCalledTimes(1);
    finish(DIRECTOR);
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it('goes straight in when a valid session already exists', async () => {
    renderForm({ status: 'authenticated', me: DIRECTOR });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});
