'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { emailSchema } from '@autonova/validation';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './auth-context';

/**
 * Sign-in deliberately checks only that something was entered: the password policy is applied when a
 * password is chosen, never here, so an older password that was valid when set still works.
 */
const loginSchema = z.object({
  email: emailSchema.pipe(z.string()),
  password: z.string().min(1, 'Enter your password.'),
});
type LoginValues = z.input<typeof loginSchema>;

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

  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      router.replace('/');
    } catch (error) {
      // The email stays; the password is cleared so a wrong one is not left on screen.
      resetField('password');
      setFormError(messageFor(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in">
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        error={errors.email ? 'Enter a valid email address.' : undefined}
        required
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        required
        {...register('password')}
      />
      <div role="alert" aria-live="polite">
        {formError ? (
          <p className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {formError}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
