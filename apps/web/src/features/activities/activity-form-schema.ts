import { ActivityType, enumValues } from '@autonova/enums';
import { z } from 'zod';

/**
 * The early, friendly check for the report form. It mirrors the API's rules (`activities.schemas.ts`);
 * the API validates everything again, and decides about the future date using the server's clock.
 */
const text = (value: string | undefined) => (value ?? '').trim();
const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .refine((value) => text(value).length <= max, `${label} must be at most ${max} characters.`);

const attendee = z.object({
  contactId: z.string().nullable(),
  name: z.string(),
  organisation: z.string(),
});

export const activityFormSchema = z.object({
  type: z.enum(enumValues(ActivityType)),
  occurredDate: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'Choose the date.'),
  occurredTime: z.string().refine((value) => /^\d{2}:\d{2}$/.test(value), 'Choose the time.'),
  location: optionalText(300, 'The location'),
  discussion: z
    .string()
    .refine((value) => text(value) !== '', 'Describe what was discussed.')
    .refine(
      (value) => text(value).length <= 10_000,
      'The discussion must be at most 10,000 characters.',
    ),
  painPoints: optionalText(5_000, 'Pain points'),
  currentTools: optionalText(5_000, 'Current tools'),
  nextSteps: optionalText(5_000, 'Next steps'),
  attendees: z.array(attendee).max(20, 'Add at most 20 attendees.'),
});

export type ActivityFormValues = z.infer<typeof activityFormSchema>;

/** Field names the API may report problems for; anything else it sends is ignored. */
export const ACTIVITY_FORM_FIELDS = [
  'type',
  'occurredDate',
  'location',
  'discussion',
  'painPoints',
  'currentTools',
  'nextSteps',
  'attendees',
] as const;

/** The API names the date field `occurredAt`; on the form it is the date input. */
export const API_FIELD_TO_FORM: Record<string, (typeof ACTIVITY_FORM_FIELDS)[number]> = {
  occurredAt: 'occurredDate',
  gps: 'location',
};
