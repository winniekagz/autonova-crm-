'use client';

import { CompanyIndustry, PermissionKey, enumValues } from '@autonova/enums';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useUrlParams } from '@/hooks/use-url-params';
import { pageParam, readChoice, readPage, readSearch } from '@/lib/url-params';
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

  if (!allowed) return <Alert tone="warning">You do not have permission to view companies.</Alert>;
  const loading = query.isPending;
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const error = query.isError ? companyErrorText(query.error) : null;
  const filtered = Boolean(q || industry || includeArchived);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
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
        <SelectField label="Industry" name="industry" defaultValue={industry} key={`i-${industry}`}>
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
      {error ? (
        <div className="mt-4 space-y-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="mt-6 text-sm text-ink-soft">
          Loading companies…
        </p>
      ) : error ? null : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">
          <h2 className="font-semibold">{filtered ? 'No companies match' : 'No companies yet'}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {filtered
              ? 'Try a different search or clear the filters.'
              : 'Add a company, then add its contacts and link leads to it.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-canvas text-ink-soft">
              <tr>
                <th className="p-3 font-medium">Company</th>
                <th className="p-3 font-medium">Industry</th>
                <th className="p-3 font-medium">Location</th>
                <th className="p-3 font-medium">Contacts</th>
                <th className="p-3 font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {items.map((company) => (
                <tr key={company.id} className="border-t border-line">
                  <td className="p-3">
                    <Link
                      className="font-medium text-primary underline"
                      href={`/companies/${company.id}`}
                    >
                      {company.name}
                    </Link>
                    {company.archived ? (
                      <span className="ml-2 text-xs text-ink-soft">Archived</span>
                    ) : null}
                    {company.kraPin ? (
                      <div className="text-xs text-ink-soft">{company.kraPin}</div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {company.industry ? INDUSTRY_LABELS[company.industry] : '—'}
                  </td>
                  <td className="p-3">{company.location || '—'}</td>
                  <td className="p-3">{company.contactCount}</td>
                  <td className="p-3">{company.leadCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          {total} compan{total === 1 ? 'y' : 'ies'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => update({ page: pageParam(page - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={page >= lastPage || loading}
            onClick={() => update({ page: pageParam(page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
