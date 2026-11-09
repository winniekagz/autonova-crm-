'use client';

import type { CompanyDto } from '@autonova/contracts';
import Link from 'next/link';
import { createAppColumnHelper } from '@/components/data-table/table-hook';
import { INDUSTRY_LABELS } from './company-format';

const column = createAppColumnHelper<CompanyDto>();

export const companyColumns = column.columns([
  column.accessor('name', {
    header: 'Company',
    enableHiding: false,
    cell: ({ row }) => {
      const company = row.original;
      return (
        <>
          <Link className="font-medium text-primary underline" href={`/companies/${company.id}`}>
            {company.name}
          </Link>
          {company.archived ? <span className="ml-2 text-xs text-ink-soft">Archived</span> : null}
          {company.kraPin ? <div className="text-xs text-ink-soft">{company.kraPin}</div> : null}
        </>
      );
    },
  }),
  column.accessor('industry', {
    header: 'Industry',
    cell: ({ getValue }) => {
      const industry = getValue();
      return industry ? INDUSTRY_LABELS[industry] : '—';
    },
  }),
  column.accessor('location', {
    header: 'Location',
    cell: ({ getValue }) => getValue() || '—',
  }),
  column.accessor('contactCount', { header: 'Contacts', meta: { className: 'tabular-nums' } }),
  column.accessor('leadCount', { header: 'Leads', meta: { className: 'tabular-nums' } }),
]);
