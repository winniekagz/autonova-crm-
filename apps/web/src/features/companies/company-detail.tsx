'use client';

import type { CompanyDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { ApiError } from '@/lib/api-client';
import { useArchiveCompany, useCompanyQuery } from './companies.queries';
import { CompanyContacts } from './company-contacts';
import { INDUSTRY_LABELS, companyErrorText } from './company-format';
import { CompanyLeads } from './company-leads';

function Details({ company }: { company: CompanyDto }) {
  const rows: [string, string | null][] = [
    ['KRA PIN', company.kraPin],
    ['Location', company.location],
    ['Industry', company.industry ? INDUSTRY_LABELS[company.industry] : null],
    ['Staff', company.staffCount === null ? null : String(company.staffCount)],
    ['Branches', company.branchCount === null ? null : String(company.branchCount)],
    ['Created by', company.createdByName],
  ];
  return (
    <dl className="mt-5 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-ink-soft">{label}</dt>
          <dd className="mt-1 text-sm">{value || '—'}</dd>
        </div>
      ))}
      <div>
        <dt className="text-xs text-ink-soft">Website</dt>
        <dd className="mt-1 text-sm">
          {company.website ? (
            <a
              className="text-primary underline"
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              {company.website}
            </a>
          ) : (
            '—'
          )}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-xs text-ink-soft">Social links</dt>
        <dd className="mt-1 space-y-1 text-sm">
          {company.socialLinks.length === 0
            ? '—'
            : company.socialLinks.map((link) => (
                <div key={link}>
                  <a
                    className="text-primary underline"
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link}
                  </a>
                </div>
              ))}
        </dd>
      </div>
    </dl>
  );
}

export function CompanyDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.CompaniesRead);
  const query = useCompanyQuery(id, allowed);
  const archive = useArchiveCompany(id);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!allowed) return <Alert tone="warning">You do not have permission to view companies.</Alert>;
  if (query.isError) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="max-w-xl space-y-3">
        <Alert tone="error">
          {gone
            ? 'This company does not exist or is not in your list.'
            : companyErrorText(query.error)}
        </Alert>
        {gone ? null : (
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        )}
        <Link href="/companies" className="block text-primary underline">
          Back to companies
        </Link>
      </div>
    );
  }
  if (!query.data) return <p role="status">Loading company…</p>;
  const company = query.data;

  const run = async (archiveIt: boolean) => {
    setNotice(null);
    setActionError(null);
    try {
      await archive.mutateAsync({ archive: archiveIt });
      setNotice(archiveIt ? 'Company archived.' : 'Company restored.');
    } catch (error) {
      setActionError(companyErrorText(error));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            {company.contactCount} contact{company.contactCount === 1 ? '' : 's'} ·{' '}
            {company.leadCount} lead
            {company.leadCount === 1 ? '' : 's'}
          </p>
          <h1 className="text-2xl font-semibold text-navy">
            {company.name}
            {company.archived ? (
              <span className="ml-3 rounded-full border border-line bg-canvas px-2 py-0.5 align-middle text-xs font-normal text-ink-soft">
                Archived
              </span>
            ) : null}
          </h1>
        </div>
        <div className="flex gap-2">
          {can(me, PermissionKey.CompaniesUpdate) && !company.archived ? (
            <Link
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
              href={`/companies/${company.id}/edit`}
            >
              Edit company
            </Link>
          ) : null}
          {can(me, PermissionKey.CompaniesArchive) ? (
            company.archived ? (
              <Button
                variant="secondary"
                disabled={archive.isPending}
                onClick={() => void run(false)}
              >
                Restore
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Archive
              </Button>
            )
          ) : null}
        </div>
      </div>
      {notice ? (
        <div className="mt-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}
      <Details company={company} />
      <CompanyContacts company={company} />
      <CompanyLeads company={company} />
      <Link className="mt-4 inline-block text-sm text-primary underline" href="/companies">
        Back to companies
      </Link>
      <ConfirmDialog
        open={confirming}
        title="Archive this company?"
        confirmLabel="Archive company"
        busy={archive.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run(true)}
      >
        <p>
          {company.name} will be hidden from lists and from new leads, and its KRA PIN becomes
          available again. Its history is kept and you can restore it later. A company with open
          leads cannot be archived.
        </p>
      </ConfirmDialog>
    </section>
  );
}
