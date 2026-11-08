import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiErrors,
  RATE_LIMITED_ERROR,
  VALIDATION_ERROR,
  privateErrors,
  type DocumentedError,
  type SchemaObject,
} from '../../../common/api-docs.js';

const TYPES = ['VISIT', 'CALL', 'DEMO', 'MEETING'];

const attendeeSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'kind', 'contactId', 'name', 'organisation', 'jobTitle'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    kind: { type: 'string', enum: ['CONTACT', 'EXTERNAL'] },
    contactId: { type: 'string', format: 'uuid', nullable: true },
    name: { type: 'string' },
    organisation: { type: 'string', nullable: true },
    jobTitle: { type: 'string', nullable: true },
  },
};

const activitySchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'leadId',
    'type',
    'occurredAt',
    'location',
    'gps',
    'discussion',
    'painPoints',
    'currentTools',
    'nextSteps',
    'attendees',
    'attachmentCount',
    'archived',
    'createdByUserId',
    'createdByName',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    leadId: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: TYPES },
    occurredAt: {
      type: 'string',
      format: 'date-time',
      description: 'When the interaction happened, not when it was recorded.',
    },
    location: { type: 'string', nullable: true },
    gps: {
      type: 'object',
      nullable: true,
      required: ['latitude', 'longitude'],
      properties: { latitude: { type: 'number' }, longitude: { type: 'number' } },
    },
    discussion: { type: 'string' },
    painPoints: { type: 'string', nullable: true },
    currentTools: { type: 'string', nullable: true },
    nextSteps: { type: 'string', nullable: true },
    attendees: { type: 'array', items: attendeeSchema },
    attachmentCount: { type: 'integer', description: 'Active attachments.' },
    archived: { type: 'boolean' },
    createdByUserId: { type: 'string', format: 'uuid' },
    createdByName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const attachmentSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'activityId',
    'category',
    'fileName',
    'mimeType',
    'sizeBytes',
    'uploadedByName',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    activityId: { type: 'string', format: 'uuid' },
    category: { type: 'string', enum: ['PHOTO', 'VOICE_NOTE', 'DOCUMENT'] },
    fileName: { type: 'string' },
    mimeType: { type: 'string' },
    sizeBytes: { type: 'integer' },
    uploadedByName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const pageOf = (item: SchemaObject): SchemaObject => ({
  type: 'object',
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: item },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
});

const leadNotFound: DocumentedError = {
  status: 404,
  codes: ['LEAD_NOT_FOUND', 'ACTIVITY_NOT_FOUND'],
  when: 'No such lead or activity, the lead is not visible to the caller, or the activity belongs to a different lead (all read the same).',
};
const attachmentNotFound: DocumentedError = {
  status: 404,
  codes: [
    'LEAD_NOT_FOUND',
    'ACTIVITY_NOT_FOUND',
    'ATTACHMENT_NOT_FOUND',
    'ATTACHMENT_FILE_UNAVAILABLE',
  ],
  when: 'The lead, activity or attachment is unknown, invisible or archived; or (`ATTACHMENT_FILE_UNAVAILABLE`) the stored file is missing.',
};
const notYours: DocumentedError = {
  status: 403,
  codes: ['ACTIVITY_NOT_YOURS', 'ACTIVITY_DIRECTOR_ONLY', 'FORBIDDEN', 'MFA_REQUIRED'],
  when: '`ACTIVITY_NOT_YOURS`: only the person who recorded a report, or a Director, can change it. `ACTIVITY_DIRECTOR_ONLY`: only a Director can archive or restore a report or remove an attachment.',
};
const stateConflict: DocumentedError = {
  status: 409,
  codes: [
    'ACTIVITY_ARCHIVED',
    'ACTIVITY_ATTENDEE_UNAVAILABLE',
    'ATTENDEE_NOT_EXTERNAL',
    'ATTACHMENT_LIMIT_REACHED',
    'ACTIVITY_HOLD_EXISTS',
    'ACTIVITY_NOT_HELD',
  ],
  when: 'The report is archived, an attendee contact is not a contact of the lead’s company, the attendee is not an unlinked outside attendee, the report already has 20 attachments, or a hold is already (or is not) in place.',
};
const uploadRejected: DocumentedError[] = [
  {
    status: 413,
    codes: ['ATTACHMENT_TOO_LARGE'],
    when: 'The file exceeds the limit for its category (photo 10 MB, document 25 MB, voice note 20 MB), or `ATTACHMENT_TOTAL_EXCEEDED`: the report’s attachments would pass the 50 MB total.',
  },
  {
    status: 415,
    codes: ['ATTACHMENT_TYPE_NOT_ALLOWED', 'ATTACHMENT_CONTENT_MISMATCH'],
    when: 'The extension is not allowed for the category, or the real contents do not match it. The browser-declared type is ignored.',
  },
];

const ok = (schema: SchemaObject, description: string, status = 200) =>
  ApiResponse({ status, description, schema });

export const DocListActivities = () =>
  applyDecorators(
    ok(pageOf(activitySchema), 'Paginated reports of the lead, newest interaction first.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );
export const DocCreateActivity = () =>
  applyDecorators(
    ok(activitySchema, 'Recorded report.', 201),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, stateConflict, RATE_LIMITED_ERROR),
  );
export const DocGetActivity = () =>
  applyDecorators(
    ok(activitySchema, 'Report details.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );
export const DocUpdateActivity = () =>
  applyDecorators(
    ok(activitySchema, 'Updated report.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, notYours, stateConflict),
  );
export const DocArchiveActivity = () =>
  applyDecorators(
    ok(activitySchema, 'Archived report.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, notYours, stateConflict),
  );
export const DocRestoreActivity = () =>
  applyDecorators(
    ok(activitySchema, 'Restored report.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, notYours),
  );
export const DocListAttachments = () =>
  applyDecorators(
    ok({ type: 'array', items: attachmentSchema }, 'Active attachments of the report.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );
export const DocUploadAttachment = () =>
  applyDecorators(
    ok(attachmentSchema, 'Stored attachment.', 201),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      leadNotFound,
      notYours,
      stateConflict,
      ...uploadRejected,
      RATE_LIMITED_ERROR,
    ),
  );
export const DocDownloadAttachment = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'The file, always as an attachment with `X-Content-Type-Options: nosniff`.',
      content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, attachmentNotFound),
  );
export const DocLinkAttendee = () =>
  applyDecorators(
    ok(activitySchema, 'The report with the attendee linked.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, notYours, stateConflict),
  );
export const DocPlaceHold = () =>
  applyDecorators(
    ok(activitySchema, 'The report, now under a hold.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, stateConflict),
  );
export const DocLiftHold = () =>
  applyDecorators(
    ok(activitySchema, 'The report, no longer under a hold.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, stateConflict),
  );
export const DocArchiveAttachment = () =>
  applyDecorators(
    ApiResponse({ status: 204, description: 'Archived.' }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, attachmentNotFound, notYours),
  );

export const activityBodySchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'occurredAt', 'discussion'],
  properties: {
    type: { type: 'string', enum: TYPES },
    occurredAt: {
      type: 'string',
      format: 'date-time',
      example: '2026-11-08T07:30:00.000Z',
      description: 'When it happened. May be in the past; not in the future.',
    },
    location: { type: 'string', maxLength: 300 },
    gps: {
      type: 'object',
      nullable: true,
      description: 'Optional check-in, site visits only.',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
      },
    },
    discussion: { type: 'string', minLength: 1, maxLength: 10000 },
    painPoints: { type: 'string', maxLength: 5000 },
    currentTools: { type: 'string', maxLength: 5000 },
    nextSteps: { type: 'string', maxLength: 5000 },
    attendees: {
      type: 'array',
      maxItems: 20,
      items: {
        oneOf: [
          {
            type: 'object',
            required: ['contactId'],
            properties: { contactId: { type: 'string', format: 'uuid' } },
          },
          {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' }, organisation: { type: 'string' } },
          },
        ],
      },
      description:
        'Contacts of the lead’s company by id, or outside people by name and organisation. Sending the list replaces it.',
    },
  },
};
