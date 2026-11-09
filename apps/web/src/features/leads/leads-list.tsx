'use client';

import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { LeadDto } from '@autonova/contracts';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useUrlParams } from '@/hooks/use-url-params';
import { pageParam, readPage, readSearch } from '@/lib/url-params';
import { leadErrorText } from './lead-format';
import { leadColumns, leadInitialVisibility } from './leads-table';
import { NewLeadDrawer } from './new-lead-drawer';
import { useLeadsList } from './leads.queries';

const PAGE_SIZE = 20;

export function LeadsList() {
  const { me } = useAuth();
  // Search and page live in the URL: refresh, bookmarks and shared links restore the same view.
  const { searchParams, update } = useUrlParams();
  const search = readSearch(searchParams.get('q'));
  const page = readPage(searchParams.get('page'));
  const allowed = can(me, PermissionKey.LeadsList);
  const canCreate = can(me, PermissionKey.LeadsCreate);
  const query = useLeadsList(search, page, allowed);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<LeadDto | null>(null);

  const table = useDataTable({
    columns: leadColumns,
    data: query.data?.items,
    total: query.data?.total,
    page,
    pageSize: PAGE_SIZE,
    onPageChange: (next) => update({ page: pageParam(next) }),
    initialVisibility: leadInitialVisibility,
  });

  if (!allowed) return <Alert tone="warning">You do not have permission to view leads.</Alert>;

  const error = query.isError ? leadErrorText(query.error) : null;
  const filtered = search !== '';

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Leads</h1>
          <p className="mt-1 text-sm text-ink-soft">Your pipeline and next follow-ups</p>
        </div>
        {canCreate ? (
          <Button
            onClick={() => {
              setCreated(null);
              setCreating(true);
            }}
          >
            New lead
          </Button>
        ) : null}
      </div>
      {created ? (
        <div className="mt-4">
          <Alert tone="success">
            Lead {created.name} created.{' '}
            <Link className="font-medium underline" href={`/leads/${created.id}`}>
              Open lead
            </Link>
          </Alert>
        </div>
      ) : null}
      <DataTable
        table={table}
        label="leads"
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={error}
        onRetry={() => void query.refetch()}
        toolbar={
          <form
            className="flex max-w-xl items-end gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const text = new FormData(event.currentTarget).get('q');
              update({ q: readSearch(typeof text === 'string' ? text : ''), page: null });
            }}
            role="search"
          >
            <div className="flex-1">
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
        }
        empty={
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <h2 className="font-semibold">{filtered ? 'No leads match' : 'No leads yet'}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {filtered
                ? 'Try a different search.'
                : 'Add a prospect to start tracking follow-ups.'}
            </p>
          </div>
        }
      />
      {canCreate ? (
        <NewLeadDrawer
          open={creating}
          onClose={() => setCreating(false)}
          // The save already invalidated the lists, so the table refetches on its own. New leads are
          // the most recently updated, so page 1 is where this one appears.
          onCreated={(lead) => {
            setCreating(false);
            setCreated(lead);
            if (page > 1) update({ page: null });
          }}
        />
      ) : null}
    </section>
  );
}
