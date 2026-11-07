import type { LoginResponse } from '@autonova/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { EXPIRY_SKEW_MS, SessionManager, type RefreshLocks } from './session-manager';

const session = (token: string, expiresIn = 900): LoginResponse => ({
  accessToken: token,
  tokenType: 'Bearer',
  expiresIn,
  mfaRequired: false,
});
const ended = () => new ApiError(401, 'REFRESH_TOKEN_INVALID', 'ended');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(refresh = vi.fn<() => Promise<LoginResponse>>(), locks: RefreshLocks | null = null) {
  const clock = { t: 1_000_000 };
  const manager = new SessionManager({ refresh, locks, now: () => clock.t });
  return { manager, refresh, clock };
}

describe('SessionManager', () => {
  it('refuses to hand out a token before anyone signed in, without calling the API', async () => {
    const { manager, refresh } = setup();
    await expect(manager.accessToken()).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns the adopted token while it is fresh, with no refresh', async () => {
    const { manager, refresh } = setup();
    manager.adopt(session('t1'));
    await expect(manager.accessToken()).resolves.toBe('t1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes once the token is within the skew of expiring', async () => {
    const { manager, refresh, clock } = setup();
    refresh.mockResolvedValue(session('t2'));
    manager.adopt(session('t1', 900));
    clock.t += 900_000 - EXPIRY_SKEW_MS + 1;
    await expect(manager.accessToken()).resolves.toBe('t2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('restores a session from the cookie on startup and then holds the token in memory', async () => {
    const { manager, refresh } = setup();
    refresh.mockResolvedValue(session('restored'));
    await manager.restore();
    await expect(manager.accessToken()).resolves.toBe('restored');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shares ONE refresh between any number of concurrent callers', async () => {
    const { manager, refresh, clock } = setup();
    const gate = deferred<LoginResponse>();
    refresh.mockReturnValue(gate.promise);
    manager.adopt(session('old'));
    clock.t += 900_000;

    const callers = Array.from({ length: 10 }, () => manager.accessToken());
    gate.resolve(session('new'));
    expect(await Promise.all(callers)).toEqual(Array(10).fill('new'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('overlapping restore() calls (React StrictMode) share one exchange', async () => {
    const { manager, refresh } = setup();
    refresh.mockResolvedValue(session('r'));
    await Promise.all([manager.restore(), manager.restore()]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  describe('renew(stale)', () => {
    it('refreshes when the rejected token is still the one we hold', async () => {
      const { manager, refresh } = setup();
      refresh.mockResolvedValue(session('new'));
      manager.adopt(session('stale'));
      await expect(manager.renew('stale')).resolves.toBe('new');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('reuses a replacement another caller already obtained instead of refreshing again', async () => {
      const { manager, refresh } = setup();
      manager.adopt(session('replacement'));
      await expect(manager.renew('stale')).resolves.toBe('replacement');
      expect(refresh).not.toHaveBeenCalled();
    });

    it('many requests rejected as expired together cause a single refresh', async () => {
      const { manager, refresh } = setup();
      const gate = deferred<LoginResponse>();
      refresh.mockReturnValue(gate.promise);
      manager.adopt(session('stale'));
      const renewals = Array.from({ length: 5 }, () => manager.renew('stale'));
      gate.resolve(session('new'));
      expect(await Promise.all(renewals)).toEqual(Array(5).fill('new'));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure handling and loop prevention', () => {
    it('a rejected refresh token ends the session and nothing refreshes afterwards', async () => {
      const { manager, refresh, clock } = setup();
      refresh.mockRejectedValue(ended());
      manager.adopt(session('old'));
      clock.t += 900_000;

      await expect(manager.accessToken()).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
      await expect(manager.accessToken()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(manager.renew('old')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a network failure does NOT end the session; the next call may try again', async () => {
      const { manager, refresh, clock } = setup();
      refresh.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
      refresh.mockResolvedValueOnce(session('back'));
      manager.adopt(session('old'));
      clock.t += 900_000;

      await expect(manager.accessToken()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      await expect(manager.accessToken()).resolves.toBe('back');
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('a 5xx is not a rejection of the token either', async () => {
      const { manager, refresh, clock } = setup();
      refresh.mockRejectedValueOnce(new ApiError(503, 'HTTP_ERROR', 'down'));
      manager.adopt(session('old'));
      clock.t += 900_000;
      await expect(manager.accessToken()).rejects.toMatchObject({ status: 503 });
      refresh.mockResolvedValueOnce(session('ok'));
      await expect(manager.accessToken()).resolves.toBe('ok');
    });

    it('a 401 with another code (e.g. CSRF/origin 403 or generic 401) is not treated as ended', async () => {
      const { manager, refresh, clock } = setup();
      refresh.mockRejectedValueOnce(new ApiError(403, 'CSRF_REJECTED', 'no'));
      manager.adopt(session('old'));
      clock.t += 900_000;
      await expect(manager.accessToken()).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
      refresh.mockResolvedValueOnce(session('ok'));
      await expect(manager.accessToken()).resolves.toBe('ok');
    });

    it('does not resurrect a session that was cleared while a refresh was in flight', async () => {
      const { manager, refresh, clock } = setup();
      const gate = deferred<LoginResponse>();
      refresh.mockReturnValue(gate.promise);
      manager.adopt(session('old'));
      clock.t += 900_000;

      const pending = manager.accessToken();
      manager.clear(); // user pressed "Sign out"
      gate.resolve(session('late'));
      await expect(pending).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(manager.accessToken()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('a failed refresh in flight does not clear a newer sign-in', async () => {
      const { manager, refresh, clock } = setup();
      const gate = deferred<LoginResponse>();
      refresh.mockReturnValue(gate.promise);
      manager.adopt(session('old'));
      clock.t += 900_000;
      const pending = manager.accessToken();
      manager.clear();
      manager.adopt(session('fresh-login'));
      gate.reject(ended());
      await expect(pending).rejects.toBeDefined();
      await expect(manager.accessToken()).resolves.toBe('fresh-login');
    });
  });

  describe('cross-tab coordination', () => {
    it('runs the refresh inside the shared lock', async () => {
      const order: string[] = [];
      const locks: RefreshLocks = {
        request: async (name, callback) => {
          order.push(`lock:${name}`);
          const result = await callback();
          order.push('unlock');
          return result;
        },
      };
      const refresh = vi.fn(async () => {
        order.push('refresh');
        return session('t');
      });
      const { manager } = setup(refresh, locks);
      await manager.restore();
      expect(order).toEqual(['lock:autonova-refresh', 'refresh', 'unlock']);
    });

    it('two tabs sharing a lock never refresh at the same time', async () => {
      let tail: Promise<unknown> = Promise.resolve();
      const locks: RefreshLocks = {
        request: (_name, callback) => {
          const run = tail.then(callback);
          tail = run.catch(() => undefined);
          return run;
        },
      };
      let running = 0;
      let maxRunning = 0;
      const slowRefresh = (token: string) =>
        vi.fn(async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 5));
          running -= 1;
          return session(token);
        });
      const tabA = setup(slowRefresh('a'), locks).manager;
      const tabB = setup(slowRefresh('b'), locks).manager;
      await Promise.all([tabA.restore(), tabB.restore()]);
      expect(maxRunning).toBe(1);
    });

    it('without the lock the same two tabs DO overlap (proves the test can detect it)', async () => {
      let running = 0;
      let maxRunning = 0;
      const slowRefresh = (token: string) =>
        vi.fn(async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 5));
          running -= 1;
          return session(token);
        });
      await Promise.all([
        setup(slowRefresh('a'), null).manager.restore(),
        setup(slowRefresh('b'), null).manager.restore(),
      ]);
      expect(maxRunning).toBe(2);
    });

    it('works without Web Locks (single-tab coordination only)', async () => {
      const { manager, refresh } = setup(vi.fn().mockResolvedValue(session('t')), null);
      await manager.restore();
      await expect(manager.accessToken()).resolves.toBe('t');
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
