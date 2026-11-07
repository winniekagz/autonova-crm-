import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { runAuthed, type AuthedAccess } from './authed-call';

const err = (status: number, code: string) => new ApiError(status, code, code);

function access(over: Partial<AuthedAccess> = {}) {
  const value = {
    getAccessToken: vi.fn(async () => 'tok-1'),
    renewAccessToken: vi.fn(async () => 'tok-2'),
    expireSession: vi.fn(),
    ...over,
  };
  return value satisfies AuthedAccess;
}

describe('runAuthed', () => {
  it('passes the current token and returns the result', async () => {
    const a = access();
    const call = vi.fn(async (token: string) => `ok:${token}`);
    await expect(runAuthed(a, call)).resolves.toBe('ok:tok-1');
    expect(a.renewAccessToken).not.toHaveBeenCalled();
  });

  it('on 401 TOKEN_EXPIRED renews once and retries the same call with the new token', async () => {
    const a = access();
    const call = vi
      .fn<(t: string) => Promise<string>>()
      .mockRejectedValueOnce(err(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce('done');
    await expect(runAuthed(a, call)).resolves.toBe('done');
    expect(a.renewAccessToken).toHaveBeenCalledWith('tok-1');
    expect(call.mock.calls.map((c) => c[0])).toEqual(['tok-1', 'tok-2']);
    expect(a.expireSession).not.toHaveBeenCalled();
  });

  it('retries at most once: a second 401 ends the session instead of looping', async () => {
    const a = access();
    const call = vi.fn().mockRejectedValue(err(401, 'TOKEN_EXPIRED'));
    await expect(runAuthed(a, call)).rejects.toMatchObject({ status: 401 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(a.renewAccessToken).toHaveBeenCalledTimes(1);
    expect(a.expireSession).toHaveBeenCalledTimes(1);
  });

  it('an unrelated 401 (revoked session, disabled user) ends the session without refreshing', async () => {
    const a = access();
    const call = vi.fn().mockRejectedValue(err(401, 'UNAUTHENTICATED'));
    await expect(runAuthed(a, call)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(a.renewAccessToken).not.toHaveBeenCalled();
    expect(a.expireSession).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each(['FORBIDDEN', 'MFA_REQUIRED'])(
    '403 %s is an authorization error: no refresh, no retry, no sign-out',
    async (code) => {
      const a = access();
      const call = vi.fn().mockRejectedValue(err(403, code));
      await expect(runAuthed(a, call)).rejects.toMatchObject({ status: 403, code });
      expect(call).toHaveBeenCalledTimes(1);
      expect(a.renewAccessToken).not.toHaveBeenCalled();
      expect(a.expireSession).not.toHaveBeenCalled();
    },
  );

  it('network errors are passed through untouched', async () => {
    const a = access();
    const call = vi.fn().mockRejectedValue(err(0, 'NETWORK_ERROR'));
    await expect(runAuthed(a, call)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(a.renewAccessToken).not.toHaveBeenCalled();
    expect(a.expireSession).not.toHaveBeenCalled();
  });

  it('other API errors (400, 404, 409, 500) are passed through untouched', async () => {
    for (const status of [400, 404, 409, 500]) {
      const a = access();
      const call = vi.fn().mockRejectedValue(err(status, 'X'));
      await expect(runAuthed(a, call)).rejects.toMatchObject({ status });
      expect(a.expireSession).not.toHaveBeenCalled();
    }
  });

  it('does not call the API at all when no token can be obtained', async () => {
    const a = access({
      getAccessToken: vi.fn().mockRejectedValue(err(401, 'REFRESH_TOKEN_INVALID')),
    });
    const call = vi.fn();
    await expect(runAuthed(a, call)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    expect(call).not.toHaveBeenCalled();
  });

  it('propagates a failed renewal without retrying the call', async () => {
    const a = access({
      renewAccessToken: vi.fn().mockRejectedValue(err(401, 'REFRESH_TOKEN_INVALID')),
    });
    const call = vi.fn().mockRejectedValue(err(401, 'TOKEN_EXPIRED'));
    await expect(runAuthed(a, call)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
