'use client';

import type { Paginated, UserDto } from '@autonova/contracts';
import { PermissionKey, SystemRoleKey, UserStatus, enumValues } from '@autonova/enums';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useUrlParams } from '@/hooks/use-url-params';
import { pageParam, readChoice, readPage, readSearch } from '@/lib/url-params';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { UserStatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { roleLabel } from '@/features/auth/roles';
import { isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';
import { RolesLoadNotice } from './roles-load-notice';
import { useRoles } from './use-roles';
import { useUsersList } from './users.queries';

const PAGE_SIZE = 20;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: Paginated<UserDto> }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

/** What the screen shows for a query: loading until there is an answer, then data or a safe error. */
function toLoadState(query: {
  data: Paginated<UserDto> | undefined;
  error: unknown;
  isError: boolean;
}): LoadState {
  if (query.isError) {
    return isPermissionDenied(query.error)
      ? { kind: 'denied' }
      : { kind: 'error', message: userErrorMessage(query.error) };
  }
  return query.data ? { kind: 'ready', page: query.data } : { kind: 'loading' };
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : 'Never';

export function UserList() {
  const { me } = useAuth();

  // Search, filters and page live in the URL, so a refresh, a bookmark or a shared link restores
  // the same view and Back returns to the previous one.
  const { searchParams, update } = useUrlParams();
  const q = readSearch(searchParams.get('q'));
  const status = readChoice(searchParams.get('status'), enumValues(UserStatus));
  const role = readChoice(searchParams.get('role'), enumValues(SystemRoleKey));
  const page = readPage(searchParams.get('page'));

  const allowed = can(me, PermissionKey.UsersList);

  const usersQuery = useUsersList({ q, status, role, page, pageSize: PAGE_SIZE }, allowed);
  const state = toLoadState(usersQuery);

  // Roles only fill the filter; failing to load them must not break the list.
  const { state: rolesState, retry: retryRoles } = useRoles(
    allowed && can(me, PermissionKey.RolesList),
  );
  const roles = rolesState.kind === 'ready' ? rolesState.roles : [];

  if (!allowed || state.kind === 'denied') return <PermissionDenied what="view users" />;

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get('q');
    update({ q: readSearch(typeof text === 'string' ? text : ''), page: null });
  }

  const filtersActive = q !== '' || status !== '' || role !== '';
  const canCreate = can(me, PermissionKey.UsersCreate);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Users</h1>
          <p className="mt-1 text-ink-soft">People who can sign in to Autonova CRM.</p>
        </div>
        {canCreate ? (
          <Link
            href="/users/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Invite user
          </Link>
        ) : null}
      </div>

      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Filter users"
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
      >
        <TextField
          label="Search"
          type="search"
          name="q"
          placeholder="Name or email"
          // Uncontrolled and re-created when the URL's search changes (Back, a pasted link).
          key={q}
          defaultValue={q}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => update({ status: e.target.value, page: null })}
        >
          <option value="">All statuses</option>
          {enumValues(UserStatus).map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Role"
          value={role}
          onChange={(e) => update({ role: e.target.value, page: null })}
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {roleLabel(r.key)}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {rolesState.kind === 'error' ? (
        <div className="mt-3">
          <RolesLoadNotice what="the role filter" onRetry={retryRoles} />
        </div>
      ) : null}

      <div className="mt-5" aria-live="polite" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' ? <ListSkeleton /> : null}

        {state.kind === 'error' ? (
          <div className="space-y-3">
            <Alert tone="error">{state.message}</Alert>
            <Button variant="secondary" onClick={() => void usersQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === 'ready' && state.page.items.length === 0 && page > 1 ? (
          <div className="space-y-3">
            <Alert tone="info">There are no users on page {page}. The list may have changed.</Alert>
            <Button variant="secondary" onClick={() => update({ page: null })}>
              Go to the first page
            </Button>
          </div>
        ) : null}

        {state.kind === 'ready' && state.page.items.length === 0 && page === 1 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-medium">
              {filtersActive ? 'No users match your filters' : 'No users yet'}
            </p>
            <p className="mt-1 text-ink-soft">
              {filtersActive
                ? 'Try a different search or clear the filters.'
                : 'Invite the first person to get started.'}
            </p>
            {!filtersActive && canCreate ? (
              <Link href="/users/new" className="mt-3 inline-block text-primary underline">
                Invite user
              </Link>
            ) : null}
          </div>
        ) : null}

        {state.kind === 'ready' && state.page.items.length > 0 ? (
          <UserTable page={state.page} onPage={(next) => update({ page: pageParam(next) })} />
        ) : null}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading users">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg border border-line bg-surface" />
      ))}
    </div>
  );
}

function UserTable({ page, onPage }: { page: Paginated<UserDto>; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <>
      {/* Phone: compact cards. Desktop: table (docs/webdesign.md §9). */}
      <ul className="space-y-2 md:hidden" aria-label="Users">
        {page.items.map((user) => (
          <li key={user.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/users/${user.id}`} className="font-medium text-primary underline">
                {user.fullName}
              </Link>
              <UserStatusBadge status={user.status} />
            </div>
            <p className="mt-0.5 break-all text-ink-soft">{user.email}</p>
            <p className="mt-1 text-[13px]">{user.roles.map(roleLabel).join(', ')}</p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Users</caption>
          <thead className="border-b border-line bg-canvas text-ink-soft">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Roles
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Last sign-in
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/users/${user.id}`} className="font-medium text-primary underline">
                    {user.fullName}
                  </Link>
                  <div className="text-ink-soft">{user.email}</div>
                </td>
                <td className="px-4 py-3">{user.roles.map(roleLabel).join(', ')}</td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3 tabular-nums">{formatDate(user.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination" className="mt-3 flex items-center justify-between">
        <p className="text-[13px] text-ink-soft">
          Page {page.page} of {totalPages} · {page.total} {page.total === 1 ? 'user' : 'users'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page.page <= 1}
            onClick={() => onPage(page.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={page.page >= totalPages}
            onClick={() => onPage(page.page + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
    </>
  );
}
