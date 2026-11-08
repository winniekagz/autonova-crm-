'use client';

import type { MeResponse } from '@autonova/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '@/lib/api-client';
import * as authApi from './api';
import { SessionManager, browserLocks, isSessionEnded } from './session-manager';

/**
 * - restoring: page just loaded; asking the API whether the refresh cookie is still good.
 * - authenticated: `me` is loaded and an access token is held in memory.
 * - unauthenticated: no valid session; protected pages send the user to /login.
 * - unavailable: could not find out (network/server error). NOT treated as signed out: the cookie
 *   may be perfectly valid, so the user can retry instead of being sent to sign in again.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  me: MeResponse | null;
  /** Signs in, then loads the profile. Throws ApiError on failure. */
  signIn: (email: string, password: string) => Promise<MeResponse>;
  /** Clears local state immediately, then revokes the session on the server. */
  signOut: () => Promise<void>;
  /**
   * The server no longer accepts our session (revoked, expired, user disabled). Drops local state
   * without another round trip; the app shell then sends the user to the sign-in page.
   */
  expireSession: () => void;
  /** Try restoring the session again after status became `unavailable`. */
  retryRestore: () => void;
  /** An access token valid right now; refreshes first if needed. Never exposes the refresh token. */
  getAccessToken: () => Promise<string>;
  /** A replacement for `stale`, which the API rejected as expired. */
  renewAccessToken: (stale: string) => Promise<string>;
  reloadProfile: () => Promise<MeResponse>;
}

export const AuthContext = createContext<AuthState | null>(null);

/**
 * Authentication/session state. The access token lives ONLY in the SessionManager's memory — never
 * in localStorage, sessionStorage, IndexedDB or a readable cookie — so a script injected into the
 * page cannot read a long-lived credential. A reload starts with no token and restores the session
 * through the HttpOnly refresh cookie, which page scripts cannot read either.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(
    () => new SessionManager({ refresh: authApi.refreshSession, locks: browserLocks() }),
  );
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await manager.restore();
        const profile = await authApi.getMe(await manager.accessToken());
        if (cancelled) return;
        setMe(profile);
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        if (isSessionEnded(error) || (error instanceof ApiError && error.status === 401)) {
          manager.clear();
          setStatus('unauthenticated');
        } else {
          setStatus('unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, attempt]);

  const retryRestore = useCallback(() => {
    setStatus('restoring');
    setAttempt((n) => n + 1);
  }, []);

  const expireSession = useCallback(() => {
    manager.clear();
    setMe(null);
    setStatus('unauthenticated');
  }, [manager]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await authApi.login(email, password);
      manager.adopt(session);
      try {
        const profile = await authApi.getMe(session.accessToken);
        setMe(profile);
        setStatus('authenticated');
        return profile;
      } catch (error) {
        // Do not leave a half-open session behind if the profile cannot be loaded.
        await authApi.logout(session.accessToken).catch(() => undefined);
        manager.clear();
        throw error;
      }
    },
    [manager],
  );

  const signOut = useCallback(async () => {
    // The user must never appear signed in after pressing "Sign out".
    setMe(null);
    setStatus('unauthenticated');
    // A fresh token is needed to authorise the revocation; fetched BEFORE the manager is cleared,
    // because nothing may refresh once it is.
    const token = await manager.accessToken().catch(() => null);
    manager.clear();
    if (!token) return;
    try {
      await authApi.logout(token);
    } catch (error) {
      // An already-invalid token means the session is gone anyway.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  }, [manager]);

  const getAccessToken = useCallback(async () => {
    try {
      return await manager.accessToken();
    } catch (error) {
      if (isSessionEnded(error)) expireSession();
      throw error;
    }
  }, [manager, expireSession]);

  const renewAccessToken = useCallback(
    async (stale: string) => {
      try {
        return await manager.renew(stale);
      } catch (error) {
        if (isSessionEnded(error)) expireSession();
        throw error;
      }
    },
    [manager, expireSession],
  );

  const reloadProfile = useCallback(async () => {
    const profile = await authApi.getMe(await manager.accessToken());
    setMe(profile);
    setStatus('authenticated');
    return profile;
  }, [manager]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      signIn,
      signOut,
      expireSession,
      retryRestore,
      getAccessToken,
      renewAccessToken,
      reloadProfile,
    }),
    [
      status,
      me,
      signIn,
      signOut,
      expireSession,
      retryRestore,
      getAccessToken,
      renewAccessToken,
      reloadProfile,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
