import { ActivityType, AttachmentCategory, enumValues } from '@autonova/enums';
import { paginationQuerySchema, reasonSchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();

const attendee = z.union([
  z.object({ contactId: uuidSchema }).strict(),
  z
    .object({
      name: z.string().trim().min(1).max(200),
      organisation: optionalText(200),
    })
    .strict(),
]);

const gps = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

const fields = {
  type: z.enum(enumValues(ActivityType)),
  occurredAt: z.iso.datetime(),
  location: optionalText(300),
  gps: gps.nullable().optional(),
  discussion: z.string().trim().min(1).max(10_000),
  painPoints: optionalText(5_000),
  currentTools: optionalText(5_000),
  nextSteps: optionalText(5_000),
  attendees: z.array(attendee).max(20).optional(),
};

export const createActivitySchema = z.object(fields).strict();

export const updateActivitySchema = z
  .object({
    ...fields,
    type: fields.type.optional(),
    occurredAt: fields.occurredAt.optional(),
    discussion: fields.discussion.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const activityIdSchema = uuidSchema;
export const attachmentIdSchema = uuidSchema;

export const listActivitiesQuerySchema = paginationQuerySchema.extend({
  type: z.enum(enumValues(ActivityType)).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

/** Archiving and removing need a reason (decision 2026-11-08), so the history says why. */
export const archiveActivitySchema = z.object({ reason: reasonSchema }).strict();
export const removeAttachmentSchema = z.object({ reason: reasonSchema }).strict();

/** Links an outside attendee to a contact of the lead's company, once the person is in the CRM. */
export const linkAttendeeSchema = z.object({ contactId: uuidSchema }).strict();
export const attendeeIdSchema = uuidSchema;

const holdText = (max: number) => z.string().trim().min(1).max(max);
export const placeHoldSchema = z
  .object({ reference: holdText(120), reason: holdText(500) })
  .strict();

const retentionItem = z
  .object({
    kind: z.enum(['GPS', 'VOICE_NOTE']),
    activityId: uuidSchema,
    attachmentId: uuidSchema.optional(),
  })
  .strict()
  .refine((item) => (item.kind === 'VOICE_NOTE') === (item.attachmentId !== undefined), {
    message: 'A voice note needs its attachment id; a check-in must not have one',
    path: ['attachmentId'],
  });
export const retentionApprovalSchema = z
  .object({
    items: z.array(retentionItem).min(1).max(100),
    reference: holdText(120),
    reason: holdText(500),
  })
  .strict();

/** The multipart field that picks the attachment category; the file itself is a separate part. */
export const uploadAttachmentSchema = z
  .object({
    category: z.enum(enumValues(AttachmentCategory)),
    // Multipart fields are strings. Required for voice notes (checked in the use case, with a clear message).
    recordingNoticeGiven: z.enum(['true', 'false']).optional(),
  })
  .strict();

export type CreateActivityBody = z.infer<typeof createActivitySchema>;
export type UpdateActivityBody = z.infer<typeof updateActivitySchema>;
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
export type ArchiveActivityBody = z.infer<typeof archiveActivitySchema>;
export type RemoveAttachmentBody = z.infer<typeof removeAttachmentSchema>;
export type LinkAttendeeBody = z.infer<typeof linkAttendeeSchema>;
export type PlaceHoldBody = z.infer<typeof placeHoldSchema>;
export type RetentionApprovalBody = z.infer<typeof retentionApprovalSchema>;
export type UploadAttachmentBody = z.infer<typeof uploadAttachmentSchema>;
export type AttendeeBody = z.infer<typeof attendee>;
