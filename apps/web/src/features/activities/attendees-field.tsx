'use client';

import type { ContactDto } from '@autonova/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import type { ActivityFormValues } from './activity-form-schema';

type Attendee = ActivityFormValues['attendees'][number];

interface AttendeesFieldProps {
  value: Attendee[];
  onChange: (value: Attendee[]) => void;
  /** The active contacts of the lead's company; empty for an individual prospect. */
  contacts: ContactDto[];
  error?: string | undefined;
}

/** Attendees are existing contacts of the lead's company, or outside people typed by name and organisation. */
export function AttendeesField({ value, onChange, contacts, error }: AttendeesFieldProps) {
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const chosen = new Set(value.flatMap((a) => (a.contactId ? [a.contactId] : [])));

  const toggle = (id: string, checked: boolean) =>
    onChange(
      checked
        ? [...value, { contactId: id, name: '', organisation: '' }]
        : value.filter((a) => a.contactId !== id),
    );
  const externals = value.map((a, index) => ({ a, index })).filter(({ a }) => !a.contactId);
  const canAdd = name.trim() !== '' && value.length < 20;

  return (
    <fieldset className="space-y-3 sm:col-span-2">
      <legend className="mb-1 text-[13px] font-medium text-ink">Attendees</legend>
      {contacts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-ink-soft">Contacts at the company</p>
          {contacts.map((contact) => (
            <label key={contact.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.has(contact.id)}
                onChange={(event) => toggle(contact.id, event.target.checked)}
              />
              <span>
                {contact.name}
                {contact.jobTitle ? ` (${contact.jobTitle})` : ''}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        <p className="text-xs text-ink-soft">Other people (not in the CRM)</p>
        {externals.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {externals.map(({ a, index }) => (
              <li key={`${a.name}-${index}`} className="flex items-center justify-between gap-2">
                <span>
                  {a.name}
                  {a.organisation ? `, ${a.organisation}` : ''}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            label="Organisation"
            value={organisation}
            onChange={(event) => setOrganisation(event.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!canAdd}
            onClick={() => {
              onChange([
                ...value,
                { contactId: null, name: name.trim(), organisation: organisation.trim() },
              ]);
              setName('');
              setOrganisation('');
            }}
          >
            Add person
          </Button>
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}
