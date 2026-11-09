'use client';

import type { UserDto } from '@autonova/contracts';
import Link from 'next/link';
import { createAppColumnHelper } from '@/components/data-table/table-hook';
import { UserStatusBadge } from '@/components/ui/status-badge';
import { roleLabel } from '@/features/auth/roles';

const column = createAppColumnHelper<UserDto>();

export const formatLastSignIn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : 'Never';

export const userColumns = column.columns([
  column.accessor('fullName', {
    header: 'Name',
    enableHiding: false,
    cell: ({ row }) => (
      <>
        <Link href={`/users/${row.original.id}`} className="font-medium text-primary underline">
          {row.original.fullName}
        </Link>
        <div className="text-ink-soft">{row.original.email}</div>
      </>
    ),
  }),
  column.accessor((user) => user.roles.map(roleLabel).join(', '), {
    id: 'roles',
    header: 'Roles',
    meta: { label: 'Roles' },
  }),
  column.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => <UserStatusBadge status={getValue()} />,
  }),
  column.accessor('lastLoginAt', {
    header: 'Last sign-in',
    cell: ({ getValue }) => formatLastSignIn(getValue()),
    meta: { className: 'tabular-nums whitespace-nowrap' },
  }),
]);
