'use client';

import type { SessionDto } from '@autonova/contracts';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { describeDevice } from './device-label';
import { useRevokeSession, useSessionsQuery } from './sessions.queries';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NETWORK_ERROR') return error.message;
  return 'Something went wrong. Please try again.';
}

export function SessionList() {
  const query = useSessionsQuery();
  const revoke = useRevokeSession();
  const [pending, setPending] = useState<SessionDto | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const sessions = query.data;
  const loading = query.isPending;
  const failed = query.isError && !sessions;

  async function confirmRevoke() {
    if (!pending) return;
    try {
      await revoke.mutateAsync(pending.id);
      setNotice({ tone: 'success', text: 'Session signed out.' });
    } catch (error) {
      // 404: already gone (ended elsewhere meanwhile). The list refreshes itself; say so kindly.
      if (error instanceof ApiError && error.status === 404) {
        setNotice({ tone: 'success', text: 'That session had already ended.' });
      } else {
        setNotice({ tone: 'error', text: errorMessage(error) });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy">Active sessions</h1>
      <p className="mt-1 text-ink-soft">
        Places where you are signed in. Sign out any you do not recognise.
      </p>

      <div className="mt-4" aria-live="polite">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>

      <div className="mt-4" aria-busy={loading}>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Loading sessions">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-line bg-surface"
              />
            ))}
          </div>
        ) : null}

        {failed ? (
          <div className="space-y-3">
            <Alert tone="error">{errorMessage(query.error)}</Alert>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {sessions && sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-medium">No active sessions</p>
            <p className="mt-1 text-ink-soft">Sign in again to start a new one.</p>
          </div>
        ) : null}

        {sessions && sessions.length > 0 ? (
          <ul className="space-y-2" aria-label="Sessions">
            {sessions.map((session) => (
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
        busy={revoke.isPending}
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
