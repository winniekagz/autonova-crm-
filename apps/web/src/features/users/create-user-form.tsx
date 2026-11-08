'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { PermissionKey } from '@autonova/enums';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { CREATE_USER_FIELDS, createUserSchema, type CreateUserValues } from './create-user-schema';
import { isDuplicateEmail, isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';
import { RolePicker } from './role-picker';
import { useCreateUser, useRolesQuery } from './users.queries';

export function CreateUserForm() {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.UsersCreate);
  const rolesQuery = useRolesQuery(allowed);
  const createUser = useCreateUser();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', roles: [] },
  });

  const denied = isPermissionDenied(rolesQuery.error) || isPermissionDenied(createUser.error);
  if (!allowed || denied) return <PermissionDenied what="invite users" />;

  const onSubmit = handleSubmit(async (values) => {
    if (createUser.isPending) return;
    setFormError(null);
    try {
      await createUser.mutateAsync(values);
    } catch (error) {
      // Everything typed stays in the form. A 403 is shown as "access denied" above.
      if (isPermissionDenied(error)) return;
      if (isDuplicateEmail(error))
        setError('email', { type: 'server', message: userErrorMessage(error) });
      else if (!applyServerFieldErrors(error, setError, CREATE_USER_FIELDS)) {
        setFormError(userErrorMessage(error));
      }
    }
  });

  function inviteAnother() {
    createUser.reset();
    reset();
    setFormError(null);
  }

  const created = createUser.data;
  if (created) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert tone="success">
          <p className="font-medium">Invitation email sent to {created.email}.</p>
          <p className="mt-1">The setup link expires in 48 hours and can only be used once.</p>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Link href={`/users/${created.id}`} className="text-primary underline">
            View {created.fullName}
          </Link>
          <button type="button" onClick={inviteAnother} className="text-primary underline">
            Invite another user
          </button>
          <Link href="/users" className="text-primary underline">
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  const roles = rolesQuery.data;
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-navy">Invite user</h1>
      <p className="mt-1 text-ink-soft">
        The person is added as <strong>Invited</strong> and cannot sign in until they set a
        password.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4" aria-label="Invite user">
        <TextField
          label="Full name"
          autoComplete="off"
          error={errors.fullName?.message}
          required
          {...register('fullName')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={
            errors.email?.type === 'server'
              ? errors.email.message
              : errors.email
                ? 'Enter a valid email address.'
                : undefined
          }
          required
          {...register('email')}
        />

        {rolesQuery.isPending ? (
          <p className="text-ink-soft" role="status">
            Loading roles…
          </p>
        ) : null}
        {rolesQuery.isError ? (
          <Alert tone="error">{userErrorMessage(rolesQuery.error)}</Alert>
        ) : null}
        {roles ? (
          <Controller
            control={control}
            name="roles"
            render={({ field }) => (
              <RolePicker
                roles={roles}
                selected={field.value}
                onChange={field.onChange}
                error={errors.roles?.message}
              />
            )}
          />
        ) : null}

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/users"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting || !roles}>
            {isSubmitting ? 'Inviting…' : 'Invite user'}
          </Button>
        </div>
      </form>
    </div>
  );
}
