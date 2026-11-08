'use client';

import type { CompanyDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { labelFor } from '@/features/leads/lead-format';
import { formatNairobiDate } from '@/lib/nairobi-time';
import { useCompanyLeads } from './companies.queries';
import { companyErrorText } from './company-format';

export function CompanyLeads({ company }: { company: CompanyDto }) {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.LeadsList);
  const leads = useCompanyLeads(company.id, allowed);
  if (!allowed) return null;
  const items = leads.data?.items ?? [];
  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="company-leads-heading"
    >
      <h2 id="company-leads-heading" className="text-lg font-semibold text-navy">
        Leads
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Deals with this company. You see the leads you own
        {me?.roles.includes('director') ? ' and everyone else’s' : ''}.
      </p>
      {leads.isLoading ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Loading leads…
        </p>
      ) : leads.isError ? (
        <div className="mt-3">
          <Alert tone="error">{companyErrorText(leads.error)}</Alert>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No leads yet. Link a lead to this company from the lead&apos;s page.
        </p>
      ) : (
        <ul className="mt-3">
          {items.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-wrap justify-between gap-2 border-t border-line py-3 first:border-t-0"
            >
              <div>
                <Link className="font-medium text-primary underline" href={`/leads/${lead.id}`}>
                  {lead.name}
                </Link>
                <p className="text-sm text-ink-soft">
                  {labelFor(lead.stage)} · Owner {lead.ownerName}
                  {lead.estimatedValue ? ` · ${lead.currency} ${lead.estimatedValue}` : ''}
                </p>
              </div>
              <p className="text-sm text-ink-soft">
                Follow-up {formatNairobiDate(lead.nextActionAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
