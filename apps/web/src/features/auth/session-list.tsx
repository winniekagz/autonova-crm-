'use client';

import type { SessionDto } from '@autonova/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import * as authApi from './api';
import { useAuthedRequest } from './use-authed-request';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; sessions: SessionDto[] }
  | { kind: 'error'; message: string };

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

/** A short, human label from the user-agent string. Falls back to the raw text, never to nothing. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? userAgent.slice(0, 60);
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NETWORK_ERROR') return error.message;
  return 'Something went wrong. Please try again.';
}

export function SessionList() {
  const request = useAuthedRequest();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<SessionDto | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    request((token) => authApi.listSessions(token))
      .then((sessions) => {
        if (!cancelled) setState({ kind: 'ready', sessions });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [request, reloadKey]);

  const confirmRevoke = useCallback(async () => {
    if (!pending) return;
    setRevoking(true);
    try {
      await request((token) => authApi.revokeSession(token, pending.id));
      setState((s) =>
        s.kind === 'ready'
          ? { kind: 'ready', sessions: s.sessions.filter((x) => x.id !== pending.id) }
          : s,
      );
      setNotice({ tone: 'success', text: 'Session signed out.' });
    } catch (error) {
      // 404: already gone (ended elsewhere meanwhile). Refresh the list instead of showing an error.
      if (error instanceof ApiError && error.status === 404) {
        setReloadKey((k) => k + 1);
        setNotice({ tone: 'success', text: 'That session had already ended.' });
      } else {
        setNotice({ tone: 'error', text: errorMessage(error) });
      }
    } finally {
      setRevoking(false);
      setPending(null);
    }
  }, [pending, request]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy">Active sessions</h1>
      <p className="mt-1 text-ink-soft">
        Places where you are signed in. Sign out any you do not recognise.
      </p>

      <div className="mt-4" aria-live="polite">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>

      <div className="mt-4" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' ? (
          <div className="space-y-2" role="status" aria-label="Loading sessions">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-line bg-surface"
              />
            ))}
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div className="space-y-3">
            <Alert tone="error">{state.message}</Alert>
            <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === 'ready' && state.sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-medium">No active sessions</p>
            <p className="mt-1 text-ink-soft">Sign in again to start a new one.</p>
          </div>
        ) : null}

        {state.kind === 'ready' && state.sessions.length > 0 ? (
          <ul className="space-y-2" aria-label="Sessions">
            {state.sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <div>
                  <p className="font-medium">
                    {describeDevice(session.userAgent)}
                    {session.current ? (
                      <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {session.ip ?? 'Unknown address'}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-soft">
                    Signed in {formatDateTime(session.createdAt)} · Ends{' '}
                    {formatDateTime(session.expiresAt)}
                  </p>
                </div>
                {session.current ? null : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNotice(null);
                      setPending(session);
                    }}
                    aria-label={`Sign out ${describeDevice(session.userAgent)}`}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Sign out this session?"
        confirmLabel="Sign out"
        busy={revoking}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setPending(null)}
      >
        <p>
          {pending ? describeDevice(pending.userAgent) : ''} will be signed out immediately and must
          sign in again.
        </p>
      </ConfirmDialog>
    </div>
  );
}
