'use client';

import type { RoleDto, UserDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import { emailSchema, fullNameSchema } from '@autonova/validation';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import * as usersApi from './api';
import { isDuplicateEmail, isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';
import { RolePicker } from './role-picker';

type FieldErrors = { email?: string; fullName?: string; roles?: string };

export function CreateUserForm() {
  const { me } = useAuth();
  const request = useAuthedRequest();
  const allowed = can(me, PermissionKey.UsersCreate);

  const [roles, setRoles] = useState<RoleDto[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<UserDto | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    request((token) => usersApi.listRoles(token))
      .then((result) => {
        if (!cancelled) setRoles(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isPermissionDenied(error)) setDenied(true);
        else setRolesError(userErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, request]);

  if (!allowed || denied) return <PermissionDenied what="invite users" />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const next: FieldErrors = {};
    const emailResult = emailSchema.safeParse(email);
    const nameResult = fullNameSchema.safeParse(fullName);
    if (!emailResult.success) next.email = 'Enter a valid email address.';
    if (!nameResult.success) next.fullName = nameResult.error.issues[0]?.message ?? 'Enter a name.';
    if (selected.length === 0) next.roles = 'Select at least one role.';
    setErrors(next);
    setFormError(null);
    if (!emailResult.success || !nameResult.success || selected.length === 0) return;

    setSubmitting(true);
    try {
      const user = await request((token) =>
        usersApi.createUser(token, {
          email: emailResult.data,
          fullName: nameResult.data,
          roles: selected,
        }),
      );
      setCreated(user);
    } catch (error) {
      // Input is preserved on failure so nothing has to be retyped.
      if (isDuplicateEmail(error)) setErrors({ email: userErrorMessage(error) });
      else if (isPermissionDenied(error)) setDenied(true);
      else setFormError(userErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function inviteAnother() {
    setCreated(null);
    setEmail('');
    setFullName('');
    setSelected([]);
    setErrors({});
    setFormError(null);
  }

  if (created) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert tone="success">
          <p className="font-medium">{created.fullName} has been added as an invited user.</p>
          <p className="mt-1">
            They cannot sign in yet: email invitations are not available, so no password has been
            set. The account stays invited until that feature exists.
          </p>
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
          name="fullName"
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          required
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />

        {roles === null && !rolesError ? (
          <p className="text-ink-soft" role="status">
            Loading roles…
          </p>
        ) : null}
        {rolesError ? <Alert tone="error">{rolesError}</Alert> : null}
        {roles ? (
          <RolePicker
            roles={roles}
            selected={selected}
            onChange={setSelected}
            error={errors.roles}
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
          <Button type="submit" disabled={submitting || roles === null}>
            {submitting ? 'Inviting…' : 'Invite user'}
          </Button>
        </div>
      </form>
    </div>
  );
}
