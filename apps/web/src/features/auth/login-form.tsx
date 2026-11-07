'use client';

import { emailSchema } from '@autonova/validation';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './auth-context';

type FieldErrors = { email?: string; password?: string };

/** Messages are chosen by error `code`, never copied from the server, so wording stays consistent. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Invalid email or password.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and try again.';
    if (error.code === 'NETWORK_ERROR') return error.message;
  }
  return 'Something went wrong signing you in. Please try again.';
}

export function LoginForm() {
  const { signIn, status } = useAuth();
  const router = useRouter();
  // A reload on /login with a still-valid session goes straight in instead of asking for a password.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors: FieldErrors = {};
    if (!emailSchema.safeParse(email).success) errors.email = 'Enter a valid email address.';
    if (password.length === 0) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error) {
      // Input is preserved; the password is cleared so a wrong one is not left on screen.
      setPassword('');
      setFormError(messageFor(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in">
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        required
      />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        required
      />
      <div role="alert" aria-live="polite">
        {formError ? (
          <p className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {formError}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
