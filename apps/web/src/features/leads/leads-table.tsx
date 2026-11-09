'use client';

import type { LeadDto } from '@autonova/contracts';
import Link from 'next/link';
import { createAppColumnHelper } from '@/components/data-table/table-hook';
import { formatNairobiDate } from '@/lib/nairobi-time';
import { labelFor } from './lead-format';
import { LeadStageBadge } from './lead-stage-badge';

const column = createAppColumnHelper<LeadDto>();

/** Defined once at module scope: a new array on every render would rebuild the table. */
export const leadColumns = column.columns([
  column.accessor('name', {
    header: 'Lead',
    enableHiding: false,
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <>
          <Link className="font-medium text-primary underline" href={`/leads/${lead.id}`}>
            {lead.name}
          </Link>
          <div className="text-xs text-ink-soft">
            {lead.email || lead.phone || 'No contact details'}
          </div>
        </>
      );
    },
  }),
  column.accessor('companyName', {
    header: 'Company',
    cell: ({ getValue }) => getValue() || 'Individual',
  }),
  column.accessor('stage', {
    header: 'Stage',
    cell: ({ getValue }) => <LeadStageBadge stage={getValue()} />,
  }),
  column.accessor('nextAction', {
    header: 'Next action',
    meta: { className: 'max-w-64' },
  }),
  column.accessor('nextActionAt', {
    header: 'Follow-up',
    cell: ({ getValue }) => formatNairobiDate(getValue()),
    meta: { className: 'tabular-nums whitespace-nowrap' },
  }),
  column.accessor('ownerName', { header: 'Owner' }),
  column.accessor('estimatedValue', {
    header: 'Est. value',
    cell: ({ row }) =>
      row.original.estimatedValue ? `${row.original.currency} ${row.original.estimatedValue}` : '—',
    meta: { className: 'tabular-nums whitespace-nowrap' },
  }),
  column.accessor('source', {
    header: 'Source',
    cell: ({ getValue }) => labelFor(getValue()),
  }),
]);

/** Owner, value and source are one click away in the Columns menu. */
export const leadInitialVisibility = { ownerName: false, estimatedValue: false, source: false };
