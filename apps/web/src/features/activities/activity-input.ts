import type { ActivityAttendeeInput, ActivityDto, ActivityInput } from '@autonova/contracts';
import { nairobiDateOf, nairobiInstant } from '@/lib/nairobi-time';
import type { ActivityFormValues } from './activity-form-schema';

export interface GpsFix {
  latitude: number;
  longitude: number;
}

/** "HH:MM" on the Nairobi clock for an instant. */
export function nairobiTimeOf(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00';
  return `${part('hour') === '24' ? '00' : part('hour')}:${part('minute')}`;
}

/** A new report defaults to "now", but the person can move it back: reports are often written afterwards. */
export function blankActivity(now = new Date()): ActivityFormValues {
  return {
    type: 'MEETING',
    occurredDate: nairobiDateOf(now),
    occurredTime: nairobiTimeOf(now),
    location: '',
    discussion: '',
    painPoints: '',
    currentTools: '',
    nextSteps: '',
    attendees: [],
  };
}

export const activityToForm = (activity: ActivityDto): ActivityFormValues => ({
  type: activity.type,
  occurredDate: nairobiDateOf(activity.occurredAt),
  occurredTime: nairobiTimeOf(activity.occurredAt),
  location: activity.location ?? '',
  discussion: activity.discussion,
  painPoints: activity.painPoints ?? '',
  currentTools: activity.currentTools ?? '',
  nextSteps: activity.nextSteps ?? '',
  attendees: activity.attendees.map((a) => ({
    contactId: a.contactId,
    name: a.contactId ? '' : a.name,
    organisation: a.organisation ?? '',
  })),
});

/** Trims and shapes what was typed into the request body. `gps` only goes with a site visit. */
export function toActivityRequestBody(
  values: ActivityFormValues,
  gps: GpsFix | null,
): ActivityInput {
  const attendees: ActivityAttendeeInput[] = [];
  for (const a of values.attendees) {
    if (a.contactId) attendees.push({ contactId: a.contactId });
    else if (a.name.trim())
      attendees.push({ name: a.name.trim(), organisation: a.organisation.trim() });
  }
  return {
    type: values.type,
    occurredAt: nairobiInstant(values.occurredDate, values.occurredTime),
    location: (values.location ?? '').trim(),
    gps: values.type === 'VISIT' ? gps : null,
    discussion: values.discussion.trim(),
    painPoints: (values.painPoints ?? '').trim(),
    currentTools: (values.currentTools ?? '').trim(),
    nextSteps: (values.nextSteps ?? '').trim(),
    attendees,
  };
}
