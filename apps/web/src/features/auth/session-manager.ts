import type { LoginResponse } from '@autonova/contracts';
import { ApiError } from '@/lib/api-client';

/** Renew this long before expiry so a request never leaves with a token that dies in flight. */
export const EXPIRY_SKEW_MS = 30_000;
const LOCK_NAME = 'autonova-refresh';

/** The subset of the Web Locks API the manager needs (injectable for tests). */
export interface RefreshLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export function browserLocks(): RefreshLocks | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null;
  const locks = navigator.locks;
  return { request: (name, callback) => locks.request(name, callback) };
}

/** The server told us the refresh token is no good: this sign-in is over and cannot be revived. */
export function isSessionEnded(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 401 && error.code === 'REFRESH_TOKEN_INVALID'
  );
}

const notSignedIn = () => new ApiError(401, 'UNAUTHENTICATED', 'Not signed in');

interface Held {
  token: string;
  expiresAtMs: number;
}

export interface SessionManagerDeps {
  /** `POST /auth/refresh`. Must never be routed through the manager itself (no recursion). */
  refresh: () => Promise<LoginResponse>;
  /** Cross-tab mutual exclusion. Null where Web Locks do not exist: coordination is then per tab. */
  locks?: RefreshLocks | null;
  now?: () => number;
}

/**
 * Holds the access token IN MEMORY ONLY (never localStorage, sessionStorage, IndexedDB or a cookie)
 * and is the only code that calls the refresh endpoint.
 *
 * - Single flight: any number of concurrent callers share one refresh.
 * - Cross-tab: the refresh runs under a Web Lock. The refresh cookie is shared by all tabs and is
 *   rotated by every refresh, so two tabs sending it at the same moment would look like replay to
 *   the server (which would end the session). Serialised, the second tab simply sends the cookie
 *   the first tab just received.
 * - No loops: a refresh is only ever started by a caller that needs a token. A definitive rejection
 *   ends the manager (`clear`), after which nothing refreshes until the user signs in again.
 * - No timers: tokens are renewed on demand, so an idle tab does not keep the session alive.
 */
export class SessionManager {
  private held: Held | null = null;
  private active = false;
  private generation = 0;
  private inflight: Promise<LoginResponse> | null = null;
  private restoring: Promise<LoginResponse> | null = null;

  constructor(private readonly deps: SessionManagerDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** Takes over a token obtained by signing in. */
  adopt(session: LoginResponse): void {
    this.held = { token: session.accessToken, expiresAtMs: this.now() + session.expiresIn * 1000 };
    this.active = true;
  }

  /** Forgets everything and stops all future refreshes. Results of refreshes in flight are dropped. */
  clear(): void {
    this.held = null;
    this.active = false;
    this.generation += 1;
    this.inflight = null;
    this.restoring = null;
  }

  /**
   * Startup (page load / reload) and "try again": exchange the refresh cookie for an access token.
   * Callers that overlap — React StrictMode runs effects twice in development — share one exchange.
   */
  restore(): Promise<LoginResponse> {
    this.restoring ??= this.exchange().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  }

  /** A token that is valid now, refreshing first if it has expired or is about to. */
  async accessToken(): Promise<string> {
    if (!this.active) throw notSignedIn();
    if (this.held && this.now() < this.held.expiresAtMs - EXPIRY_SKEW_MS) return this.held.token;
    await this.exchange();
    return this.requireHeld();
  }

  /**
   * The API rejected `stale` as expired. If another caller already replaced it, reuse that
   * replacement instead of refreshing again.
   */
  async renew(stale: string): Promise<string> {
    if (!this.active) throw notSignedIn();
    if (this.held && this.held.token !== stale) return this.held.token;
    await this.exchange();
    return this.requireHeld();
  }

  private requireHeld(): string {
    if (!this.active || !this.held) throw notSignedIn();
    return this.held.token;
  }

  private exchange(): Promise<LoginResponse> {
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    const call = () => this.deps.refresh();
    const run = this.deps.locks ? this.deps.locks.request(LOCK_NAME, call) : call();

    const promise: Promise<LoginResponse> = run
      .then((session) => {
        // Signed out while the request was in flight: do not resurrect the session.
        if (generation === this.generation) this.adopt(session);
        return session;
      })
      .catch((error: unknown) => {
        if (isSessionEnded(error) && generation === this.generation) this.clear();
        throw error;
      })
      .finally(() => {
        if (this.inflight === promise) this.inflight = null;
      });
    this.inflight = promise;
    return promise;
  }
}
