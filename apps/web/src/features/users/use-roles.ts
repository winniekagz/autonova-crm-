'use client';

import type { RoleDto } from '@autonova/contracts';
import { useRolesQuery } from './users.queries';

/**
 * `idle` means the list was not requested (the caller may not list roles). `error` is deliberately
 * its own state, so a failed request is never mistaken for a successful but empty list.
 */
export type RolesState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; roles: RoleDto[] } | { kind: 'error' };

/** The role list for screens that offer role choices; `retry` asks again after a failure. */
export function useRoles(enabled: boolean) {
  const query = useRolesQuery(enabled);

  let state: RolesState;
  if (!enabled) state = { kind: 'idle' };
  else if (query.isError) state = { kind: 'error' };
  else if (query.data) state = { kind: 'ready', roles: query.data };
  else state = { kind: 'loading' };

  return { state, retry: () => void query.refetch() };
}
