'use client';

import type { RoleDto, UserDto } from '@autonova/contracts';
import { PermissionKey, UserStatus } from '@autonova/enums';
import { fullNameSchema } from '@autonova/validation';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserStatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { roleLabel } from '@/features/auth/roles';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import { ApiError } from '@/lib/api-client';
import * as usersApi from './api';
import { isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';
import { RolePicker } from './role-picker';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; user: UserDto }
  | { kind: 'not-found' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

export function UserDetail({ userId }: { userId: string }) {
  const { me } = useAuth();
  const request = useAuthedRequest();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const allowed = can(me, PermissionKey.UsersRead);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    request((token) => usersApi.getUser(token, userId))
      .then((user) => {
        if (!cancelled) setState({ kind: 'ready', user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isPermissionDenied(error)) setState({ kind: 'denied' });
        else if (error instanceof ApiError && error.code === 'USER_NOT_FOUND') {
          setState({ kind: 'not-found' });
        } else setState({ kind: 'error', message: userErrorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, request, userId, reloadKey]);

  useEffect(() => {
    if (!allowed || !can(me, PermissionKey.RolesList)) return;
    request((token) => usersApi.listRoles(token))
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [allowed, me, request]);

  const replaceUser = useCallback((user: UserDto) => setState({ kind: 'ready', user }), []);

  if (!allowed || state.kind === 'denied') return <PermissionDenied what="view this user" />;

  if (state.kind === 'loading') {
    return (
      <div role="status" aria-label="Loading user" className="max-w-xl space-y-3">
        <div className="h-8 w-48 animate-pulse rounded bg-line" />
        <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div className="max-w-xl space-y-3">
        <Alert tone="error">This user does not exist or is no longer available.</Alert>
        <Link href="/users" className="text-primary underline">
          Back to users
        </Link>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="max-w-xl space-y-3">
        <Alert tone="error">{state.message}</Alert>
        <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  const { user } = state;
  const isSelf = me?.id === user.id;

  return (
    <div className="max-w-2xl">
      <Link href="/users" className="text-[13px] text-primary underline">
        ← Users
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy">{user.fullName}</h1>
        <UserStatusBadge status={user.status} />
        {isSelf ? <span className="text-[13px] text-ink-soft">(you)</span> : null}
      </div>
      <p className="mt-1 break-all text-ink-soft">{user.email}</p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 rounded-lg border border-line bg-surface p-5 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-ink-soft">Last sign-in</dt>
          <dd className="tabular-nums">{formatDateTime(user.lastLoginAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Created</dt>
          <dd className="tabular-nums">{formatDateTime(user.createdAt)}</dd>
        </div>
      </dl>

      {user.status === UserStatus.Invited ? (
        <div className="mt-4">
          <Alert tone="info">
            This person has been invited but cannot sign in yet: email invitations are not
            available.
          </Alert>
        </div>
      ) : null}

      {can(me, PermissionKey.UsersUpdate) ? (
        <RenameSection user={user} onChanged={replaceUser} />
      ) : null}
      <RolesSection user={user} roles={roles} isSelf={isSelf} onChanged={replaceUser} />
      {can(me, PermissionKey.UsersDisable) ? (
        <DisableSection user={user} isSelf={isSelf} onChanged={replaceUser} />
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-6 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RenameSection({ user, onChanged }: { user: UserDto; onChanged: (u: UserDto) => void }) {
  const request = useAuthedRequest();
  const [name, setName] = useState(user.fullName);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    setFormError(null);
    const parsed = fullNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a name.');
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const updated = await request((token) => usersApi.renameUser(token, user.id, parsed.data));
      onChanged(updated);
      setName(updated.fullName);
      setSaved(true);
    } catch (e) {
      setFormError(userErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Profile">
      <form onSubmit={onSubmit} noValidate className="space-y-3" aria-label="Edit profile">
        <TextField
          label="Full name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          error={error}
        />
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {saved ? <Alert tone="success">Name saved.</Alert> : null}
        <Button
          type="submit"
          variant="secondary"
          disabled={saving || name.trim() === user.fullName}
        >
          {saving ? 'Saving…' : 'Save name'}
        </Button>
      </form>
    </Section>
  );
}

function RolesSection({
  user,
  roles,
  isSelf,
  onChanged,
}: {
  user: UserDto;
  roles: RoleDto[];
  isSelf: boolean;
  onChanged: (u: UserDto) => void;
}) {
  const { me } = useAuth();
  const request = useAuthedRequest();
  const canAssign = can(me, PermissionKey.UsersAssignRoles);
  const [selected, setSelected] = useState<string[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const unchanged = [...selected].sort().join(',') === user.roles.join(',');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || unchanged) return;
    setSaved(false);
    setError(null);
    if (selected.length === 0) {
      setFieldError('Select at least one role.');
      return;
    }
    setFieldError(undefined);
    setSaving(true);
    try {
      const updated = await request((token) => usersApi.changeUserRoles(token, user.id, selected));
      onChanged(updated);
      setSelected(updated.roles);
      setSaved(true);
    } catch (e) {
      setError(userErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // Without permission (or the role list) the section is a read-only summary.
  if (!canAssign || roles.length === 0) {
    return (
      <Section title="Roles">
        <ul className="list-disc pl-5">
          {user.roles.map((role) => (
            <li key={role}>{roleLabel(role)}</li>
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Section title="Roles">
      <form onSubmit={onSubmit} noValidate className="space-y-3" aria-label="Change roles">
        {isSelf ? (
          <Alert tone="info">You cannot change your own roles. Ask another Director.</Alert>
        ) : null}
        <RolePicker
          roles={roles}
          selected={selected}
          onChange={(next) => {
            setSelected(next);
            setSaved(false);
          }}
          error={fieldError}
          disabled={isSelf || user.status === UserStatus.Disabled}
        />
        <p className="text-xs text-ink-soft">
          Removing a role signs the person out of all their sessions immediately.
        </p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {saved ? (
          <Alert tone="success">Roles saved. The change applies on their next request.</Alert>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          disabled={saving || unchanged || isSelf || user.status === UserStatus.Disabled}
        >
          {saving ? 'Saving…' : 'Save roles'}
        </Button>
      </form>
    </Section>
  );
}

function DisableSection({
  user,
  isSelf,
  onChanged,
}: {
  user: UserDto;
  isSelf: boolean;
  onChanged: (u: UserDto) => void;
}) {
  const request = useAuthedRequest();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const updated = await request((token) => usersApi.disableUser(token, user.id));
      onChanged(updated);
      setDone(true);
      setOpen(false);
    } catch (e) {
      setOpen(false);
      setError(userErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Stays mounted after a successful disable so the confirmation below remains visible; an account
  // that was already disabled when the page loaded has nothing to offer.
  if (user.status === UserStatus.Disabled && !done) return null;

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
        {done ? <Alert tone="success">Account disabled and sessions revoked.</Alert> : null}
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
        busy={busy}
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
