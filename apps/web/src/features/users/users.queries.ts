'use client';

import type { UserDto } from '@autonova/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import * as usersApi from './api';

/** Cache keys for this feature. Everything starts with 'users' so one call can clear it all. */
export const usersKeys = {
  all: ['users'] as const,
  lists: ['users', 'list'] as const,
  list: (query: usersApi.UserListQuery) => ['users', 'list', query] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  roles: ['users', 'roles'] as const,
};

/** Roles change rarely and several screens read them, so they are shared for a few minutes. */
const ROLES_STALE_MS = 5 * 60_000;

/** One page of users for the given search, filters and page. Pass `enabled: false` to skip it. */
export function useUsersList(query: usersApi.UserListQuery, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: usersKeys.list(query),
    queryFn: () => request((token) => usersApi.listUsers(token, query)),
    enabled,
  });
}

export function useRolesQuery(enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: usersKeys.roles,
    queryFn: () => request((token) => usersApi.listRoles(token)),
    enabled,
    staleTime: ROLES_STALE_MS,
  });
}

export function useUserQuery(id: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: usersKeys.detail(id),
    queryFn: () => request((token) => usersApi.getUser(token, id)),
    enabled,
  });
}

/**
 * After a write the server's answer is the freshest copy of that user, and every list that might
 * show them is now out of date.
 */
function useAfterUserWrite() {
  const queryClient = useQueryClient();
  return (user: UserDto) => {
    queryClient.setQueryData(usersKeys.detail(user.id), user);
    void queryClient.invalidateQueries({ queryKey: usersKeys.lists });
  };
}

export function useCreateUser() {
  const request = useAuthedRequest();
  const afterWrite = useAfterUserWrite();
  return useMutation({
    mutationFn: (body: { email: string; fullName: string; roles: string[] }) =>
      request((token) => usersApi.createUser(token, body)),
    onSuccess: afterWrite,
  });
}

export function useRenameUser(id: string) {
  const request = useAuthedRequest();
  const afterWrite = useAfterUserWrite();
  return useMutation({
    mutationFn: (fullName: string) => request((token) => usersApi.renameUser(token, id, fullName)),
    onSuccess: afterWrite,
  });
}

export function useChangeUserRoles(id: string) {
  const request = useAuthedRequest();
  const afterWrite = useAfterUserWrite();
  return useMutation({
    mutationFn: (roles: string[]) => request((token) => usersApi.changeUserRoles(token, id, roles)),
    onSuccess: afterWrite,
  });
}

export function useDisableUser(id: string) {
  const request = useAuthedRequest();
  const afterWrite = useAfterUserWrite();
  return useMutation({
    mutationFn: () => request((token) => usersApi.disableUser(token, id)),
    onSuccess: afterWrite,
  });
}

export function useResendInvitation(id: string) {
  const request = useAuthedRequest();
  return useMutation({
    mutationFn: () => request((token) => usersApi.resendInvitation(token, id)),
  });
}
