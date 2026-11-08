'use client';

import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useUrlParams } from '@/hooks/use-url-params';
import { formatNairobiDate } from '@/lib/nairobi-time';
import { pageParam, readPage, readSearch } from '@/lib/url-params';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { labelFor, leadErrorText } from './lead-format';
import { useLeadsList } from './leads.queries';

export function LeadsList() {
  const { me } = useAuth();
  // Search and page live in the URL: refresh, bookmarks and shared links restore the same view.
  const { searchParams, update } = useUrlParams();
  const search = readSearch(searchParams.get('q'));
  const page = readPage(searchParams.get('page'));
  const allowed = can(me, PermissionKey.LeadsList);
  const query = useLeadsList(search, page, allowed);

  const loading = query.isPending && allowed;
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const error = query.isError ? leadErrorText(query.error) : null;

  if (!allowed) return <Alert tone="warning">You do not have permission to view leads.</Alert>;
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Leads</h1>
          <p className="mt-1 text-sm text-ink-soft">Your pipeline and next follow-ups</p>
        </div>
        {can(me, PermissionKey.LeadsCreate) ? (
          <Link
            href="/leads/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
          >
            New lead
          </Link>
        ) : null}
      </div>
      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('q');
          update({ q: readSearch(typeof text === 'string' ? text : ''), page: null });
        }}
        role="search"
      >
        <div className="w-full sm:max-w-md">
          <TextField
            label="Search leads"
            type="search"
            name="q"
            // Uncontrolled and re-created when the URL's search changes (Back, a pasted link).
            key={search}
            defaultValue={search}
            placeholder="Name, company, email or phone"
          />
        </div>
        <Button variant="secondary">Search</Button>
      </form>
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="mt-6 text-sm text-ink-soft">
          Loading leads…
        </p>
      ) : error ? null : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">
          <h2 className="font-semibold">No leads yet</h2>
          <p className="mt-1 text-sm text-ink-soft">Add a prospect to start tracking follow-ups.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-canvas text-ink-soft">
              <tr>
                <th className="p-3 font-medium">Lead</th>
                <th className="p-3 font-medium">Company</th>
                <th className="p-3 font-medium">Stage</th>
                <th className="p-3 font-medium">Next action</th>
                <th className="p-3 font-medium">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-t border-line">
                  <td className="p-3">
                    <Link className="font-medium text-primary underline" href={`/leads/${lead.id}`}>
                      {lead.name}
                    </Link>
                    <div className="text-xs text-ink-soft">
                      {lead.email || lead.phone || 'No contact details'}
                    </div>
                  </td>
                  <td className="p-3">{lead.companyName || 'Individual'}</td>
                  <td className="p-3">{labelFor(lead.stage)}</td>
                  <td className="max-w-64 p-3">{lead.nextAction}</td>
                  <td className="p-3">{formatNairobiDate(lead.nextActionAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          {total} lead{total === 1 ? '' : 's'}
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
            disabled={page * 20 >= total || loading}
            onClick={() => update({ page: pageParam(page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
