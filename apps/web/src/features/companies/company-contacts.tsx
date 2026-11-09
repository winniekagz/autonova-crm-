'use client';

import type { CompanyDto, ContactDto } from '@autonova/contracts';
import { CONTACT_ROLE_LABELS, PermissionKey } from '@autonova/enums';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useArchiveContact, useCompanyContacts } from './companies.queries';
import { companyErrorText } from './company-format';
import { ContactForm } from './contact-form';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; contact: ContactDto };

function ContactRow({
  contact,
  canEdit,
  canArchive,
  onEdit,
  onArchive,
  onRestore,
}: {
  contact: ContactDto;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <div>
        <p className="font-medium text-ink">
          {contact.name}
          {contact.role ? (
            <span className="ml-2 rounded-full border border-line bg-canvas px-2 py-0.5 text-xs font-medium text-ink">
              {CONTACT_ROLE_LABELS[contact.role]}
            </span>
          ) : null}
          {contact.isDecisionMaker ? (
            <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              Decision-maker
            </span>
          ) : null}
          {contact.archived ? (
            <span className="ml-2 rounded-full border border-line bg-canvas px-2 py-0.5 text-xs text-ink-soft">
              Archived
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {[
            contact.jobTitle,
            contact.phone,
            contact.email,
            contact.whatsappNumber ? `WhatsApp ${contact.whatsappNumber}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'No contact details'}
        </p>
      </div>
      <div className="flex gap-2">
        {canEdit && !contact.archived ? (
          <Button variant="secondary" onClick={onEdit} aria-label={`Edit ${contact.name}`}>
            Edit
          </Button>
        ) : null}
        {canArchive ? (
          contact.archived ? (
            <Button variant="secondary" onClick={onRestore} aria-label={`Restore ${contact.name}`}>
              Restore
            </Button>
          ) : (
            <Button variant="secondary" onClick={onArchive} aria-label={`Archive ${contact.name}`}>
              Archive
            </Button>
          )
        ) : null}
      </div>
    </li>
  );
}

export function CompanyContacts({ company }: { company: CompanyDto }) {
  const { me } = useAuth();
  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [showArchived, setShowArchived] = useState(false);
  const [toArchive, setToArchive] = useState<ContactDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const contacts = useCompanyContacts(company.id, showArchived);
  const archive = useArchiveContact(company.id);
  const canEdit = can(me, PermissionKey.CompaniesUpdate) && !company.archived;
  const canAdd = can(me, PermissionKey.CompaniesCreate) && !company.archived;
  const canArchive = can(me, PermissionKey.CompaniesArchive);
  const items = contacts.data?.items ?? [];

  const run = async (input: { id: string; archive: boolean; reason?: string }, done: string) => {
    setNotice(null);
    setActionError(null);
    try {
      await archive.mutateAsync(input);
      setNotice(done);
    } catch (error) {
      setActionError(companyErrorText(error));
    } finally {
      setToArchive(null);
    }
  };

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="contacts-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="contacts-heading" className="text-lg font-semibold text-navy">
          Contacts
        </h2>
        <div className="flex items-center gap-3">
          {canArchive ? (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>Show archived</span>
            </label>
          ) : null}
          {canAdd && editing.kind === 'none' ? (
            <Button onClick={() => setEditing({ kind: 'new' })}>Add contact</Button>
          ) : null}
        </div>
      </div>
      {notice ? (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-3">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}
      {editing.kind !== 'none' ? (
        <div className="mt-4">
          <ContactForm
            key={editing.kind === 'edit' ? editing.contact.id : 'new'}
            companyId={company.id}
            contact={editing.kind === 'edit' ? editing.contact : undefined}
            onDone={() => {
              setNotice(editing.kind === 'edit' ? 'Contact saved.' : 'Contact added.');
              setEditing({ kind: 'none' });
            }}
          />
        </div>
      ) : null}
      {contacts.isLoading ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Loading contacts…
        </p>
      ) : contacts.isError ? (
        <div className="mt-3">
          <Alert tone="error">{companyErrorText(contacts.error)}</Alert>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No contacts yet. Add the owner, manager or finance contact so deals can name who they are
          talking to.
        </p>
      ) : (
        <ul className="mt-3">
          {items.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              canEdit={canEdit}
              canArchive={canArchive}
              onEdit={() => {
                setNotice(null);
                setEditing({ kind: 'edit', contact });
              }}
              onArchive={() => setToArchive(contact)}
              onRestore={() => void run({ id: contact.id, archive: false }, 'Contact restored.')}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toArchive !== null}
        title="Archive this contact?"
        confirmLabel="Archive contact"
        busy={archive.isPending}
        onCancel={() => setToArchive(null)}
        onConfirm={() =>
          toArchive && void run({ id: toArchive.id, archive: true }, 'Contact archived.')
        }
      >
        <p>
          {toArchive?.name} will be hidden from the company and from new leads. You can restore them
          later. A contact still linked to a lead cannot be archived.
        </p>
      </ConfirmDialog>
    </section>
  );
}
