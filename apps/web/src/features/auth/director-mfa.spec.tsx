// @vitest-environment jsdom
import type { MeResponse } from '@autonova/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi, requestUrl } from '@/test/render';
import { AuthContext, type AuthState } from './auth-context';
import { DirectorMfa } from './director-mfa';

vi.mock('@/components/ui/qr-code', () => ({
  QrCode: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}));

const reloadProfile = vi.fn<() => Promise<MeResponse>>();
const authState = (): AuthState => ({
  status: 'authenticated',
  me: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  expireSession: vi.fn(),
  retryRestore: vi.fn(),
  getAccessToken: async () => 'test-token',
  renewAccessToken: async () => 'renewed',
  reloadProfile,
});
const mount = (onRecoveryCodes = vi.fn()) => {
  const view = render(
    <AuthContext.Provider value={authState()}>
      <DirectorMfa onRecoveryCodes={onRecoveryCodes} />
    </AuthContext.Provider>,
  );
  return { ...view, onRecoveryCodes };
};
afterEach(() => {
  vi.unstubAllGlobals();
  reloadProfile.mockReset();
});

const enrolled = { 'GET /auth/mfa/status': () => ({ body: { enrolled: true } }) };
const notEnrolled = { 'GET /auth/mfa/status': () => ({ body: { enrolled: false } }) };
const CODE_LABEL = '6-digit authenticator code';

describe('DirectorMfa: verifying an enrolled Director', () => {
  it('sends the six digits with the access token, then reloads the profile', async () => {
    const user = userEvent.setup();
    reloadProfile.mockResolvedValue({} as MeResponse);
    const { calls } = mockApi({ ...enrolled, 'POST /auth/mfa/verify': () => ({ status: 204 }) });
    mount();

    await user.type(await screen.findByLabelText(CODE_LABEL), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(reloadProfile).toHaveBeenCalledTimes(1));
    const verify = calls.find((c) => c.path === '/auth/mfa/verify');
    expect(verify?.body).toEqual({ code: '123456' });
    expect(verify?.auth).toBe('Bearer test-token');
  });

  it('keeps Verify disabled until six characters are typed, and limits the field to six', async () => {
    const user = userEvent.setup();
    mockApi(enrolled);
    mount();
    const field = await screen.findByLabelText(CODE_LABEL);
    expect(field).toHaveAttribute('maxlength', '6');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    await user.type(field, '12345');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    await user.type(field, '6');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();
  });

  it.each([
    ['MFA_CODE_INVALID', 401, 'That code was not accepted. Check it and try again.'],
    ['MFA_RATE_LIMITED', 429, 'Too many attempts. Try again in 15 minutes.'],
    ['SOMETHING_ELSE', 500, 'Could not complete this security step. Try again.'],
  ])('%s is explained plainly, never with server text', async (code, status, text) => {
    const user = userEvent.setup();
    mockApi({ ...enrolled, 'POST /auth/mfa/verify': () => apiError(status, code, 'raw detail') });
    mount();
    await user.type(await screen.findByLabelText(CODE_LABEL), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText('raw detail')).not.toBeInTheDocument();
    expect(reloadProfile).not.toHaveBeenCalled();
  });

  it('prevents a double submit while verifying', async () => {
    const user = userEvent.setup();
    reloadProfile.mockResolvedValue({} as MeResponse);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).pathname.endsWith('/mfa/status')) {
        return new Response(JSON.stringify({ enrolled: true }), { status: 200 });
      }
      await gate;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await user.type(await screen.findByLabelText(CODE_LABEL), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    const busy = await screen.findByRole('button', { name: 'Checking…' });
    expect(busy).toBeDisabled();
    await user.keyboard('{Enter}');
    release();
    await waitFor(() => expect(reloadProfile).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.filter(([url]) => requestUrl(url).pathname.endsWith('/mfa/verify')),
    ).toHaveLength(1);
  });

  it('keeps Verify disabled for a short code even if the field is edited some other way', async () => {
    mockApi(enrolled);
    mount();
    const field = await screen.findByLabelText(CODE_LABEL);
    fireEvent.change(field, { target: { value: '12345' } });
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('sends nothing for a short code even if the form is submitted directly', async () => {
    const { calls } = mockApi(enrolled);
    mount();
    const field = await screen.findByLabelText(CODE_LABEL);
    fireEvent.change(field, { target: { value: '123' } });
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.some((c) => c.path === '/auth/mfa/verify')).toBe(false);
  });

  it('refuses a recovery code that is too short, without spending an attempt', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(enrolled);
    mount();
    await user.click(
      await screen.findByRole('button', { name: 'Lost access? Use a recovery code' }),
    );
    const field = screen.getByLabelText('Recovery code');
    fireEvent.change(field, { target: { value: 'ABCD-EFGH' } });
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.some((c) => c.path === '/auth/mfa/recover')).toBe(false);
  });

  it('switches to a recovery code, clears the field, and switches back', async () => {
    const user = userEvent.setup();
    mockApi(enrolled);
    mount();
    await user.type(await screen.findByLabelText(CODE_LABEL), '123');
    await user.click(screen.getByRole('button', { name: 'Lost access? Use a recovery code' }));

    const recovery = screen.getByLabelText('Recovery code');
    expect(recovery).toHaveValue('');
    expect(recovery).toHaveAttribute('maxlength', '39');
    expect(screen.getByRole('button', { name: 'Use recovery code' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Use authenticator instead' }));
    expect(screen.getByLabelText(CODE_LABEL)).toHaveValue('');
  });

  it('a recovery code restarts enrolment and never grants access by itself', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...enrolled,
      'POST /auth/mfa/recover': () => ({ status: 204 }),
      'POST /auth/mfa/enrollment': () => ({ body: { secret: 'SECRETKEY', uri: 'otpauth://x' } }),
    });
    mount();
    await user.click(
      await screen.findByRole('button', { name: 'Lost access? Use a recovery code' }),
    );
    await user.type(screen.getByLabelText('Recovery code'), 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ12');
    await user.click(screen.getByRole('button', { name: 'Use recovery code' }));

    expect(await screen.findByText(/Recovery accepted/)).toBeInTheDocument();
    expect(await screen.findByTestId('qr')).toHaveTextContent('otpauth://x');
    expect(calls.find((c) => c.path === '/auth/mfa/recover')?.body).toEqual({
      code: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ12',
    });
    expect(reloadProfile).not.toHaveBeenCalled();
  });
});

describe('DirectorMfa: enrolment', () => {
  it('offers setup when not enrolled, shows the secret, and confirms with a code', async () => {
    const user = userEvent.setup();
    reloadProfile.mockResolvedValue({} as MeResponse);
    const { calls, onRecoveryCodes } = (() => {
      const handle = mockApi({
        ...notEnrolled,
        'POST /auth/mfa/enrollment': () => ({ body: { secret: 'SECRETKEY', uri: 'otpauth://x' } }),
        'POST /auth/mfa/enrollment/confirm': () => ({ body: { recoveryCodes: ['AAA', 'BBB'] } }),
      });
      return { ...handle, onRecoveryCodes: mount().onRecoveryCodes };
    })();

    await user.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByTestId('qr')).toHaveTextContent('otpauth://x');
    expect(screen.getByLabelText('Manual setup key')).toHaveValue('SECRETKEY');

    const confirm = screen.getByRole('button', { name: 'Confirm and enable MFA' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(CODE_LABEL), '654321');
    await user.click(confirm);

    await waitFor(() => expect(onRecoveryCodes).toHaveBeenCalledWith(['AAA', 'BBB']));
    expect(calls.find((c) => c.path === '/auth/mfa/enrollment/confirm')?.body).toEqual({
      code: '654321',
    });
    await waitFor(() => expect(reloadProfile).toHaveBeenCalled());
  });

  it('says so when enrolment status cannot be read', async () => {
    mockApi({ 'GET /auth/mfa/status': () => apiError(500, 'INTERNAL_ERROR') });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check your MFA setup. Retry this page.',
    );
  });
});
