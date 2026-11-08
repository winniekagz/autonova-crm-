'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { QrCode } from '@/components/ui/qr-code';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api-client';
import * as authApi from './api';
import { useAuth } from './auth-context';
import {
  AUTHENTICATOR_CODE_LENGTH,
  RECOVERY_CODE_MAX_LENGTH,
  RECOVERY_CODE_MIN_LENGTH,
  authenticatorCodeSchema,
  recoveryCodeSchema,
  type MfaCodeValues,
} from './mfa-code-schema';

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'MFA_RATE_LIMITED') {
    return 'Too many attempts. Try again in 15 minutes.';
  }
  if (
    error instanceof ApiError &&
    (error.code === 'MFA_CODE_INVALID' || error.code === 'MFA_RECOVERY_INVALID')
  ) {
    return 'That code was not accepted. Check it and try again.';
  }
  return 'Could not complete this security step. Try again.';
}

export function DirectorMfa({ onRecoveryCodes }: { onRecoveryCodes: (codes: string[]) => void }) {
  const { getAccessToken, reloadProfile } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One field, two shapes of code: the schema follows the mode. The form only blocks input that
  // cannot be a code; the server decides whether a code is correct.
  const { register, handleSubmit, reset, watch } = useForm<MfaCodeValues>({
    resolver: zodResolver(recoveryMode ? recoveryCodeSchema : authenticatorCodeSchema),
    defaultValues: { code: '' },
  });
  const code = watch('code');

  useEffect(() => {
    let active = true;
    void getAccessToken()
      .then(authApi.mfaStatus)
      .then((result) => {
        if (active) setEnrolled(result.enrolled);
      })
      .catch(() => {
        if (active) setError('Could not check your MFA setup. Retry this page.');
      });
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  async function beginSetup() {
    setError(null);
    setLoading(true);
    try {
      setSetup(await authApi.beginMfaEnrollment(await getAccessToken()));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }

  const submit = handleSubmit(async ({ code }) => {
    if (loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (recoveryMode) {
        await authApi.recoverMfa(token, code);
        setRecoveryMode(false);
        setEnrolled(false);
        reset({ code: '' });
        setNotice('Recovery accepted. Set up your authenticator again to restore access.');
        setSetup(await authApi.beginMfaEnrollment(token));
        return;
      }
      if (setup) {
        const result = await authApi.confirmMfaEnrollment(token, code);
        setEnrolled(true);
        onRecoveryCodes(result.recoveryCodes);
      } else {
        await authApi.verifyMfa(token, code);
        setEnrolled(true);
      }
      reset({ code: '' });
      await reloadProfile();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  });

  if (enrolled === null && !error) return <p role="status">Checking MFA setup…</p>;

  return (
    <section
      className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="mfa-title"
    >
      <h1 id="mfa-title" className="text-xl font-semibold text-navy">
        Director two-factor verification
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Verify with your authenticator app. Your access token remains in memory and the API checks
        this session on every request.
      </p>
      {notice ? <p className="mt-4 text-sm text-success">{notice}</p> : null}
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {setup ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-navy">Scan with your authenticator app</p>
            <p className="mt-1 text-sm text-ink-soft">
              Open the app on another device and scan this code. Keep it private; it contains your
              setup key.
            </p>
          </div>
          <div className="flex justify-center py-1">
            <QrCode value={setup.uri} title="Authenticator setup QR code" />
          </div>
          <p className="text-center text-xs text-ink-soft">
            Setting this up on the same device?{' '}
            <span className="text-ink">Use the manual setup key below.</span>
          </p>
          <details className="rounded-md border border-line bg-canvas px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Show manual setup details
            </summary>
            <div className="mt-3 space-y-3 pb-1">
              <TextField
                label="Manual setup key"
                readOnly
                value={setup.secret}
                className="font-mono"
              />
              <TextField
                label="Provisioning URI"
                readOnly
                value={setup.uri}
                className="font-mono text-xs"
              />
            </div>
          </details>
          <form onSubmit={submit} className="space-y-4">
            <TextField
              label="6-digit authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={AUTHENTICATOR_CODE_LENGTH}
              required
              {...register('code')}
            />
            <Button disabled={loading || code.length !== AUTHENTICATOR_CODE_LENGTH}>
              {loading ? 'Verifying…' : 'Confirm and enable MFA'}
            </Button>
          </form>
        </div>
      ) : enrolled ? (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <TextField
            label={recoveryMode ? 'Recovery code' : '6-digit authenticator code'}
            inputMode={recoveryMode ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={recoveryMode ? RECOVERY_CODE_MAX_LENGTH : AUTHENTICATOR_CODE_LENGTH}
            required
            {...register('code')}
          />
          <Button
            disabled={
              loading ||
              code.length < (recoveryMode ? RECOVERY_CODE_MIN_LENGTH : AUTHENTICATOR_CODE_LENGTH)
            }
          >
            {loading ? 'Checking…' : recoveryMode ? 'Use recovery code' : 'Verify'}
          </Button>
          <button
            type="button"
            className="block text-sm text-primary underline"
            onClick={() => {
              setRecoveryMode((value) => !value);
              reset({ code: '' });
              setError(null);
            }}
          >
            {recoveryMode ? 'Use authenticator instead' : 'Lost access? Use a recovery code'}
          </button>
        </form>
      ) : (
        <div className="mt-5">
          <p className="mb-4 text-sm">MFA must be enrolled before you can access the CRM.</p>
          <Button onClick={() => void beginSetup()} disabled={loading}>
            {loading ? 'Preparing…' : 'Set up authenticator'}
          </Button>
        </div>
      )}
    </section>
  );
}

export function RecoveryCodes({ codes, onDismiss }: { codes: string[]; onDismiss: () => void }) {
  return (
    <section
      className="mx-auto mb-5 max-w-lg rounded-lg border border-warning/30 bg-warning-soft p-5"
      aria-labelledby="recovery-title"
    >
      <h2 id="recovery-title" className="font-semibold">
        Save your recovery codes now
      </h2>
      <p className="mt-1 text-sm">Each code works once. They will not be shown again.</p>
      <ul className="my-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onDismiss}>
        I saved these codes
      </Button>
    </section>
  );
}
