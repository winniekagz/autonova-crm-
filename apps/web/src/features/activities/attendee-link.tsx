'use client';

import type { ActivityDto, ContactDto } from '@autonova/contracts';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { useLinkAttendee } from './activities.queries';
import { activityErrorText } from './activity-format';

interface AttendeeLinkProps {
  leadId: string;
  activity: ActivityDto;
  /** Active contacts of the lead's company. */
  contacts: readonly ContactDto[];
}

/**
 * Lets the person who may edit a report tie an outside attendee to a CRM contact afterwards. Nothing is
 * created: the attendee is matched to a contact that already exists, and the typed name is kept.
 */
export function AttendeeLink({ leadId, activity, contacts }: AttendeeLinkProps) {
  const link = useLinkAttendee(leadId, activity.id);
  const [attendeeId, setAttendeeId] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taken = new Set(activity.attendees.flatMap((a) => (a.contactId ? [a.contactId] : [])));
  const free = contacts.filter((c) => !taken.has(c.id));
  const outsiders = activity.attendees.filter((a) => a.kind === 'EXTERNAL');
  if (outsiders.length === 0 || free.length === 0) return null;

  const submit = async () => {
    if (!attendeeId || !contactId) return;
    setError(null);
    try {
      await link.mutateAsync({ attendeeId, contactId });
      setAttendeeId(null);
      setContactId('');
    } catch (failure) {
      setError(activityErrorText(failure));
    }
  };

  return (
    <div className="mt-2 text-sm">
      {attendeeId === null ? (
        <ul className="space-y-1">
          {outsiders.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <span>{a.name} is not linked to a contact.</span>
              <Button
                type="button"
                variant="secondary"
                aria-label={`Link ${a.name} to a contact`}
                onClick={() => setAttendeeId(a.id)}
              >
                Link to contact
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          <SelectField
            label="Contact at the company"
            value={contactId}
            disabled={link.isPending}
            onChange={(event) => setContactId(event.target.value)}
          >
            <option value="">Choose a contact…</option>
            {free.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.jobTitle ? ` (${c.jobTitle})` : ''}
              </option>
            ))}
          </SelectField>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!contactId || link.isPending}
              onClick={() => void submit()}
            >
              {link.isPending ? 'Linking…' : 'Link'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={link.isPending}
              onClick={() => setAttendeeId(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
