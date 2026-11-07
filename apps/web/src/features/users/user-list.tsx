'use client';

import type { Paginated, RoleDto, UserDto } from '@autonova/contracts';
import { PermissionKey, UserStatus, enumValues } from '@autonova/enums';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { UserStatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { roleLabel } from '@/features/auth/roles';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import * as usersApi from './api';
import { isPermissionDenied, userErrorMessage } from './error-messages';
import { PermissionDenied } from './permission-denied';

const PAGE_SIZE = 20;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: Paginated<UserDto> }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : 'Never';

export function UserList() {
  const { me } = useAuth();
  const request = useAuthedRequest();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [roles, setRoles] = useState<RoleDto[]>([]);

  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const allowed = can(me, PermissionKey.UsersList);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    request((token) => usersApi.listUsers(token, { q, status, role, page, pageSize: PAGE_SIZE }))
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', page: result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(
          isPermissionDenied(error)
            ? { kind: 'denied' }
            : { kind: 'error', message: userErrorMessage(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, request, q, status, role, page, reloadKey]);

  // Roles only fill the filter; failing to load them must not break the list.
  const loadRoles = useCallback(() => {
    request((token) => usersApi.listRoles(token))
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [request]);
  useEffect(() => {
    if (allowed && can(me, PermissionKey.RolesList)) loadRoles();
  }, [allowed, me, loadRoles]);

  if (!allowed || state.kind === 'denied') return <PermissionDenied what="view users" />;

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQ(searchText.trim());
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
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value === '' ? '' : (e.target.value as UserStatus));
          }}
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
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value);
          }}
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

      <div className="mt-5" aria-live="polite" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' ? <ListSkeleton /> : null}

        {state.kind === 'error' ? (
          <div className="space-y-3">
            <Alert tone="error">{state.message}</Alert>
            <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === 'ready' && state.page.items.length === 0 ? (
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
          <UserTable page={state.page} onPage={setPage} />
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
