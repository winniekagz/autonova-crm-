'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api-client';
import * as authApi from './api';
import { acceptInvitationSchema, type AcceptInvitationValues } from './accept-invitation-schema';

const MISSING_TOKEN =
  'This invitation link is missing its token. Ask an administrator to resend it.';

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVITATION_INVALID') {
    return 'This invitation link has expired or was already used. Ask an administrator to resend it.';
  }
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return 'Could not activate this account. Check your connection and try again.';
}

export function AcceptInvitation() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // The token arrives in the URL fragment (never sent to a server or logged). Read it once, then
  // remove it from the address bar so it cannot be copied or bookmarked by accident.
  useEffect(() => {
    const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    setToken(invitationToken);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setReady(true);
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!token) {
      setFormError(MISSING_TOKEN);
      return;
    }
    try {
      await authApi.acceptInvitation(token, values.password);
      setComplete(true);
    } catch (error) {
      setFormError(failureMessage(error));
    }
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">Autonova</p>
      <h1 className="mt-1 text-2xl font-semibold text-navy">Set up your account</h1>
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        {complete ? (
          <div className="space-y-4">
            <Alert tone="success">Your account is active. Sign in with your new password.</Alert>
            <Link href="/login" className="inline-flex text-primary underline">
              Go to sign in
            </Link>
          </div>
        ) : !ready ? (
          <p role="status" className="text-ink-soft">
            Checking your invitation…
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Set up account">
            {!token ? <Alert tone="error">{MISSING_TOKEN}</Alert> : null}
            <p className="text-sm text-ink-soft">
              Choose a password with at least 12 characters. This setup link can only be used once.
            </p>
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              required
              {...register('password')}
            />
            <TextField
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              required
              {...register('confirmPassword')}
            />
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <Button type="submit" disabled={isSubmitting || !token} className="w-full">
              {isSubmitting ? 'Activating…' : 'Set password and activate account'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
