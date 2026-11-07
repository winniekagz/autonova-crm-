'use client';

import type { MeResponse } from '@autonova/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import * as authApi from './api';

export interface AuthState {
  me: MeResponse | null;
  /** The in-memory access token, for feature API calls. Null when signed out. */
  accessToken: string | null;
  /** Signs in, then loads the profile. Throws ApiError on failure. */
  signIn: (email: string, password: string) => Promise<MeResponse>;
  signOut: () => Promise<void>;
  /**
   * The server no longer accepts our session (revoked, expired, user disabled). Drops local state
   * without another round trip; the app shell then sends the user to the sign-in page.
   */
  expireSession: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

/**
 * Authentication/session state. The access token lives ONLY in this component's memory — never in
 * localStorage or a readable cookie — so a script injected into the page cannot read a long-lived
 * credential. Consequence until refresh tokens exist (roadmap step 5): a page reload signs the user out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    try {
      const profile = await authApi.getMe(session.accessToken);
      setToken(session.accessToken);
      setMe(profile);
      return profile;
    } catch (error) {
      // Do not leave a half-open session behind if the profile cannot be loaded.
      await authApi.logout(session.accessToken).catch(() => undefined);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const current = token;
    // Clear local state first: the user must never appear signed in after pressing "Sign out".
    setToken(null);
    setMe(null);
    if (current) {
      try {
        await authApi.logout(current);
      } catch (error) {
        // An already-invalid token means the session is gone anyway.
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    }
  }, [token]);

  const expireSession = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ me, accessToken: token, signIn, signOut, expireSession }),
    [me, token, signIn, signOut, expireSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
