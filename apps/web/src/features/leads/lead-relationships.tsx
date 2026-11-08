'use client';

import type { LeadDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useSetLeadRelationships } from '@/features/companies/companies.queries';
import { CompanyPicker, type PickedCompany } from '@/features/companies/company-picker';
import { LeadContactPicker, type ContactSelection } from '@/features/companies/lead-contact-picker';
import { leadErrorText } from './lead-format';

const selectionOf = (lead: LeadDto): ContactSelection => ({
  primaryContactId: lead.primaryContact?.id ?? null,
  additionalContactIds: lead.additionalContacts.map((contact) => contact.id),
});

function Editor({ lead, onDone }: { lead: LeadDto; onDone: () => void }) {
  const save = useSetLeadRelationships(lead.id);
  const [company, setCompany] = useState<PickedCompany | null>(
    lead.company ? { id: lead.company.id, name: lead.company.name } : null,
  );
  const [contacts, setContacts] = useState<ContactSelection>(selectionOf(lead));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (save.isPending) return;
    setError(null);
    try {
      await save.mutateAsync({
        companyId: company?.id ?? null,
        primaryContactId: company ? contacts.primaryContactId : null,
        additionalContactIds: company ? contacts.additionalContactIds : [],
      });
      onDone();
    } catch (cause) {
      setError(leadErrorText(cause));
    }
  };

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-line bg-canvas p-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <CompanyPicker
        value={company}
        onChange={(next) => {
          setCompany(next);
          // Contacts belong to one company, so a different company starts with none selected.
          if (next?.id !== lead.company?.id)
            setContacts({ primaryContactId: null, additionalContactIds: [] });
          else setContacts(selectionOf(lead));
        }}
      />
      {company ? (
        <LeadContactPicker
          key={company.id}
          companyId={company.id}
          value={contacts}
          onChange={setContacts}
        />
      ) : null}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save company and contacts'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Which company and people this deal involves; the company page lists every lead linked to it. */
export function LeadRelationships({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const canEdit = can(me, PermissionKey.LeadsUpdate) && can(me, PermissionKey.CompaniesRead);
  const canOpen = can(me, PermissionKey.CompaniesRead);
  const contacts = [
    ...(lead.primaryContact ? [{ ...lead.primaryContact, primary: true }] : []),
    ...lead.additionalContacts.map((contact) => ({ ...contact, primary: false })),
  ];

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="relationships-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="relationships-heading" className="text-lg font-semibold text-navy">
          Company and contacts
        </h2>
        {canEdit && !editing ? (
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {lead.company ? 'Change' : 'Link a company'}
          </Button>
        ) : null}
      </div>
      {saved ? (
        <div className="mt-3">
          <Alert tone="success">Company and contacts saved.</Alert>
        </div>
      ) : null}
      {lead.company?.archived ? (
        <div className="mt-3">
          <Alert tone="warning">
            This company is archived. The link is kept, but new leads cannot use it.
          </Alert>
        </div>
      ) : null}
      {editing ? (
        <Editor
          lead={lead}
          onDone={() => {
            setSaved(true);
            setEditing(false);
          }}
        />
      ) : lead.company ? (
        <div className="mt-3 text-sm">
          <p>
            {canOpen ? (
              <Link
                className="font-medium text-primary underline"
                href={`/companies/${lead.company.id}`}
              >
                {lead.company.name}
              </Link>
            ) : (
              <span className="font-medium">{lead.company.name}</span>
            )}
          </p>
          {contacts.length === 0 ? (
            <p className="mt-2 text-ink-soft">No contacts linked to this deal yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  {contact.name}
                  {contact.jobTitle ? ` · ${contact.jobTitle}` : ''}
                  {contact.primary ? ' · Primary' : ''}
                  {contact.archived ? ' · Archived' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          {lead.companyName
            ? `Entered as “${lead.companyName}” before companies existed. Link it to a company record to keep one source of truth.`
            : 'An individual prospect: not linked to a company.'}
        </p>
      )}
    </section>
  );
}
