'use client';

import { CompanyIndustry, PermissionKey, enumValues } from '@autonova/enums';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useUrlParams } from '@/hooks/use-url-params';
import { pageParam, readChoice, readPage, readSearch } from '@/lib/url-params';
import { companyColumns } from './companies-table';
import { useCompaniesList } from './companies.queries';
import { INDUSTRY_LABELS, companyErrorText } from './company-format';

const PAGE_SIZE = 20;

export function CompaniesList() {
  const { me } = useAuth();
  // Search, filter and page live in the URL: refresh, bookmarks and shared links restore the same view.
  const { searchParams, update } = useUrlParams();
  const q = readSearch(searchParams.get('q'));
  const industry = readChoice(searchParams.get('industry'), enumValues(CompanyIndustry));
  const page = readPage(searchParams.get('page'));
  const includeArchived = searchParams.get('archived') === '1';
  const allowed = can(me, PermissionKey.CompaniesList);
  const query = useCompaniesList({ q, industry, page, includeArchived }, allowed, PAGE_SIZE);

  const table = useDataTable({
    columns: companyColumns,
    data: query.data?.items,
    total: query.data?.total,
    page,
    pageSize: PAGE_SIZE,
    onPageChange: (next) => update({ page: pageParam(next) }),
  });

  if (!allowed) return <Alert tone="warning">You do not have permission to view companies.</Alert>;
  const error = query.isError ? companyErrorText(query.error) : null;
  const filtered = Boolean(q || industry || includeArchived);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Companies</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Organisations you work with, their people and their deals
          </p>
        </div>
        {can(me, PermissionKey.CompaniesCreate) ? (
          <Link
            href="/companies/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
          >
            New company
          </Link>
        ) : null}
      </div>
      <DataTable
        table={table}
        label="companies"
        singular="company"
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={error}
        onRetry={() => void query.refetch()}
        toolbar={
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            role="search"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const text = data.get('q');
              const chosen = data.get('industry');
              update({
                q: readSearch(typeof text === 'string' ? text : ''),
                industry: readChoice(
                  typeof chosen === 'string' ? chosen : null,
                  enumValues(CompanyIndustry),
                ),
                archived: data.get('archived') ? '1' : null,
                page: null,
              });
            }}
          >
            <div className="w-full sm:max-w-md">
              <TextField
                label="Search companies"
                type="search"
                name="q"
                // Uncontrolled and re-created when the URL's search changes (Back, a pasted link).
                key={`${q}|${industry}|${includeArchived}`}
                defaultValue={q}
                placeholder="Name, KRA PIN or location"
              />
            </div>
            <SelectField
              label="Industry"
              name="industry"
              defaultValue={industry}
              key={`i-${industry}`}
            >
              <option value="">All industries</option>
              {enumValues(CompanyIndustry).map((value) => (
                <option key={value} value={value}>
                  {INDUSTRY_LABELS[value]}
                </option>
              ))}
            </SelectField>
            {can(me, PermissionKey.CompaniesArchive) ? (
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  name="archived"
                  defaultChecked={includeArchived}
                  key={`a-${includeArchived}`}
                />
                <span>Include archived</span>
              </label>
            ) : null}
            <Button variant="secondary">Search</Button>
          </form>
        }
        empty={
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <h2 className="font-semibold">
              {filtered ? 'No companies match' : 'No companies yet'}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {filtered
                ? 'Try a different search or clear the filters.'
                : 'Add a company, then add its contacts and link leads to it.'}
            </p>
          </div>
        }
      />
    </section>
  );
}
