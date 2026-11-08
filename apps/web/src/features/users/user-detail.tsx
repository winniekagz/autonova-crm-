'use client';

import { PermissionKey, UserStatus } from '@autonova/enums';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { UserStatusBadge } from '@/components/ui/status-badge';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { ApiError } from '@/lib/api-client';
import { isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';
import { useRoles } from './use-roles';
import { DisableSection, RenameSection, RolesSection } from './user-sections';
import { useResendInvitation, useUserQuery } from './users.queries';

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

export function UserDetail({ userId }: { userId: string }) {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.UsersRead);
  const userQuery = useUserQuery(userId, allowed);
  const resend = useResendInvitation(userId);

  const { state: rolesState, retry: retryRoles } = useRoles(
    allowed && can(me, PermissionKey.RolesList),
  );

  const error = userQuery.error;
  if (!allowed || isPermissionDenied(error)) return <PermissionDenied what="view this user" />;

  if (error instanceof ApiError && error.code === 'USER_NOT_FOUND') {
    return (
      <div className="max-w-xl space-y-3">
        <Alert tone="error">This user does not exist or is no longer available.</Alert>
        <Link href="/users" className="text-primary underline">
          Back to users
        </Link>
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className="max-w-xl space-y-3">
        <Alert tone="error">{userErrorMessage(error)}</Alert>
        <Button variant="secondary" onClick={() => void userQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!userQuery.data) {
    return (
      <div role="status" aria-label="Loading user" className="max-w-xl space-y-3">
        <div className="h-8 w-48 animate-pulse rounded bg-line" />
        <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
      </div>
    );
  }

  const user = userQuery.data;
  const isSelf = me?.id === user.id;

  const resendError = resend.isError ? userErrorMessage(resend.error) : null;

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
        <div className="mt-4 space-y-3">
          <Alert tone="info">
            This account is waiting for its owner to set a password from the invitation email. The
            setup link expires after 48 hours.
          </Alert>
          {resendError ? <Alert tone="error">{resendError}</Alert> : null}
          {resend.isSuccess ? (
            <Alert tone="success">A fresh setup email was sent to {user.email}.</Alert>
          ) : null}
          {can(me, PermissionKey.UsersCreate) ? (
            <Button variant="secondary" onClick={() => resend.mutate()} disabled={resend.isPending}>
              {resend.isPending ? 'Sending…' : 'Resend setup email'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {can(me, PermissionKey.UsersUpdate) ? <RenameSection user={user} /> : null}
      <RolesSection user={user} rolesState={rolesState} onRetryRoles={retryRoles} isSelf={isSelf} />
      {can(me, PermissionKey.UsersDisable) ? <DisableSection user={user} isSelf={isSelf} /> : null}
    </div>
  );
}
