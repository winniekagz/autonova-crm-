'use client';

import type { UserDto } from '@autonova/contracts';
import { PermissionKey, UserStatus } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { roleLabel } from '@/features/auth/roles';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { userErrorMessage } from './error-messages';
import { RolePicker } from './role-picker';
import { RolesLoadNotice } from './roles-load-notice';
import type { RolesState } from './use-roles';
import {
  changeRolesSchema,
  renameUserSchema,
  sameRoles,
  type ChangeRolesValues,
  type RenameUserValues,
} from './user-forms-schema';
import { useChangeUserRoles, useDisableUser, useRenameUser } from './users.queries';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-6 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function RenameSection({ user }: { user: UserDto }) {
  const rename = useRenameUser(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RenameUserValues>({
    resolver: zodResolver(renameUserSchema),
    defaultValues: { fullName: user.fullName },
  });
  const unchanged = watch('fullName').trim() === user.fullName;

  const onSubmit = handleSubmit(async (values) => {
    if (rename.isPending) return;
    setFormError(null);
    rename.reset();
    try {
      const updated = await rename.mutateAsync(values.fullName);
      reset({ fullName: updated.fullName });
    } catch (error) {
      if (!applyServerFieldErrors(error, setError, ['fullName'])) {
        setFormError(userErrorMessage(error));
      }
    }
  });

  return (
    <Section title="Profile">
      <form onSubmit={onSubmit} noValidate className="space-y-3" aria-label="Edit profile">
        <TextField
          label="Full name"
          error={errors.fullName?.message}
          {...register('fullName', { onChange: () => rename.reset() })}
        />
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {rename.isSuccess ? <Alert tone="success">Name saved.</Alert> : null}
        <Button type="submit" variant="secondary" disabled={isSubmitting || unchanged}>
          {isSubmitting ? 'Saving…' : 'Save name'}
        </Button>
      </form>
    </Section>
  );
}

export function RolesSection({
  user,
  rolesState,
  onRetryRoles,
  isSelf,
}: {
  user: UserDto;
  rolesState: RolesState;
  onRetryRoles: () => void;
  isSelf: boolean;
}) {
  const { me } = useAuth();
  const canAssign = can(me, PermissionKey.UsersAssignRoles);
  const roles = rolesState.kind === 'ready' ? rolesState.roles : [];
  const changeRoles = useChangeUserRoles(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangeRolesValues>({
    resolver: zodResolver(changeRolesSchema),
    defaultValues: { roles: user.roles },
  });
  const unchanged = sameRoles(watch('roles'), user.roles);
  const locked = isSelf || user.status === UserStatus.Disabled;

  const onSubmit = handleSubmit(async (values) => {
    if (changeRoles.isPending || unchanged) return;
    setFormError(null);
    changeRoles.reset();
    try {
      const updated = await changeRoles.mutateAsync(values.roles);
      reset({ roles: updated.roles });
    } catch (error) {
      setFormError(userErrorMessage(error));
    }
  });

  // Without permission (or the role list) the section is a read-only summary. A failed role
  // request is called out, not passed off as "there are no roles".
  if (!canAssign || roles.length === 0) {
    return (
      <Section title="Roles">
        <ul className="list-disc pl-5">
          {user.roles.map((role) => (
            <li key={role}>{roleLabel(role)}</li>
          ))}
        </ul>
        {canAssign && rolesState.kind === 'error' ? (
          <div className="mt-3">
            <RolesLoadNotice what="changing roles" onRetry={onRetryRoles} />
          </div>
        ) : null}
      </Section>
    );
  }

  return (
    <Section title="Roles">
      <form onSubmit={onSubmit} noValidate className="space-y-3" aria-label="Change roles">
        {isSelf ? (
          <Alert tone="info">You cannot change your own roles. Ask another Director.</Alert>
        ) : null}
        <Controller
          control={control}
          name="roles"
          render={({ field }) => (
            <RolePicker
              roles={roles}
              selected={field.value}
              onChange={(next) => {
                changeRoles.reset();
                field.onChange(next);
              }}
              error={errors.roles?.message}
              disabled={locked}
            />
          )}
        />
        <p className="text-xs text-ink-soft">
          Removing a role signs the person out of all their sessions immediately.
        </p>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {changeRoles.isSuccess ? (
          <Alert tone="success">Roles saved. The change applies on their next request.</Alert>
        ) : null}
        <Button type="submit" variant="secondary" disabled={isSubmitting || unchanged || locked}>
          {isSubmitting ? 'Saving…' : 'Save roles'}
        </Button>
      </form>
    </Section>
  );
}

export function DisableSection({ user, isSelf }: { user: UserDto; isSelf: boolean }) {
  const disable = useDisableUser(user.id);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await disable.mutateAsync();
      setOpen(false);
    } catch (e) {
      setOpen(false);
      setError(userErrorMessage(e));
    }
  }

  // Stays mounted after a successful disable so the confirmation below remains visible; an account
  // that was already disabled when the page loaded has nothing to offer.
  if (user.status === UserStatus.Disabled && !disable.isSuccess) return null;

  return (
    <Section title="Disable account">
      <p className="text-[13px] text-ink-soft">
        A disabled user cannot sign in and is signed out everywhere immediately. The account and its
        history are kept. Re-enabling is not available yet.
      </p>
      {isSelf ? (
        <p className="mt-2 text-[13px] text-ink-soft">You cannot disable your own account.</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {disable.isSuccess ? (
          <Alert tone="success">Account disabled and sessions revoked.</Alert>
        ) : null}
        {user.status !== UserStatus.Disabled ? (
          <Button variant="danger" disabled={isSelf} onClick={() => setOpen(true)}>
            Disable {user.fullName}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={open}
        title={`Disable ${user.fullName}?`}
        confirmLabel="Disable account"
        busy={disable.isPending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <p>
          {user.fullName} will be signed out of every session straight away and will not be able to
          sign in. This cannot be undone from the CRM yet.
        </p>
      </ConfirmDialog>
    </Section>
  );
}
