import { applyDecorators } from '@nestjs/common';
import {
  ApiErrors,
  VALIDATION_ERROR,
  privateErrors,
  type DocumentedError,
  type SchemaObject,
} from '../../../common/api-docs.js';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Swagger documentation of the failures each lead operation can return, kept out of the controller
 * so it stays a thin translation layer. Success shapes are described next to each operation.
 * Business rules live in `domain/lead-lifecycle.ts`; the codes below are the ones it reports.
 */

/** Also what a Business Development user gets for another person's lead: its existence is not revealed. */
const leadNotFound: DocumentedError = {
  status: 404,
  codes: ['LEAD_NOT_FOUND'],
  when: 'No such lead, or it belongs to another Business Development user (existence is not revealed).',
};

const lifecycleConflict = (codes: readonly string[], when: string): DocumentedError => ({
  status: 409,
  codes: [...codes, 'LEAD_STAGE_CHANGED'],
  when: `${when} \`LEAD_STAGE_CHANGED\`: someone else moved the lead meanwhile; reload and retry.`,
});

const contactRefSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'jobTitle', 'archived'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    jobTitle: { type: 'string', nullable: true },
    archived: { type: 'boolean' },
  },
};

const leadSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'name',
    'companyName',
    'company',
    'primaryContact',
    'additionalContacts',
    'phone',
    'email',
    'source',
    'referrerName',
    'productInterest',
    'legacyProductInterest',
    'notes',
    'estimatedValue',
    'currency',
    'stage',
    'lifecycle',
    'lostReason',
    'lostAt',
    'disqualificationReason',
    'revisitOn',
    'ownerUserId',
    'ownerName',
    'nextAction',
    'nextActionAt',
    'probability',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    companyName: {
      type: 'string',
      nullable: true,
      description:
        'The linked company’s name, or the original text for a lead not linked to a company.',
    },
    company: {
      type: 'object',
      nullable: true,
      required: ['id', 'name', 'archived'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        archived: { type: 'boolean' },
      },
    },
    primaryContact: { ...contactRefSchema, nullable: true },
    additionalContacts: { type: 'array', items: contactRefSchema },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    source: {
      type: 'string',
      enum: [
        'REFERRAL',
        'INSTAGRAM',
        'WEBSITE',
        'WALK_IN',
        'EVENT',
        'COLD_OUTREACH',
        'EXISTING_CLIENT_UPSELL',
      ],
    },
    referrerName: { type: 'string', nullable: true },
    productInterest: {
      type: 'string',
      nullable: true,
      enum: [
        'RETAIL_POS',
        'CAR_WASH_AUTOMATION',
        'ERP',
        'VISITOR_SECURITY_SYSTEM',
        'HIRING_PLATFORM',
        'CUSTOM_BUILD',
        null,
      ],
    },
    legacyProductInterest: {
      type: 'string',
      nullable: true,
      description: 'Free text from before the catalogue existed; read-only.',
    },
    notes: { type: 'string', nullable: true },
    estimatedValue: { type: 'string', nullable: true },
    currency: { type: 'string', enum: ['KES', 'USD'] },
    stage: {
      type: 'string',
      enum: [
        'NEW_LEAD',
        'VISITS_AND_CALLS',
        'QUALIFIED',
        'SCOPE_ALIGNMENT',
        'TOR_QUOTE_SENT',
        'DISQUALIFIED',
        'WON',
        'LOST',
      ],
    },
    lifecycle: {
      type: 'object',
      required: ['transitions', 'canDisqualify', 'canMarkLost'],
      properties: {
        transitions: { type: 'array', items: { type: 'string' } },
        canDisqualify: { type: 'boolean' },
        canMarkLost: { type: 'boolean' },
      },
    },
    lostReason: { type: 'string', nullable: true },
    lostAt: { type: 'string', format: 'date-time', nullable: true },
    disqualificationReason: {
      type: 'string',
      enum: [
        'NO_BUDGET',
        'NO_DECISION_MAKER',
        'NEED_DOES_NOT_FIT',
        'CHOSE_COMPETITOR',
        'UNRESPONSIVE',
        'TIMING_REVISIT_LATER',
        'OTHER',
      ],
      nullable: true,
    },
    revisitOn: { type: 'string', format: 'date', nullable: true },
    ownerUserId: { type: 'string', format: 'uuid' },
    ownerName: { type: 'string' },
    nextAction: { type: 'string' },
    nextActionAt: { type: 'string', format: 'date-time' },
    probability: { type: 'integer', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const pageSchema = (item: SchemaObject): SchemaObject => ({
  type: 'object',
  required: ['items', 'page', 'pageSize', 'total'],
  properties: {
    items: { type: 'array', items: item },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    total: { type: 'integer' },
  },
});
const historySchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'leadId',
    'fromStage',
    'toStage',
    'actorUserId',
    'actorName',
    'occurredAt',
    'reason',
    'disqualificationReason',
    'revisitOn',
    'source',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    leadId: { type: 'string', format: 'uuid' },
    fromStage: { type: 'string', nullable: true },
    toStage: { type: 'string' },
    actorUserId: { type: 'string', format: 'uuid', nullable: true },
    actorName: { type: 'string', nullable: true },
    occurredAt: { type: 'string', format: 'date-time' },
    reason: { type: 'string', nullable: true },
    disqualificationReason: { type: 'string', nullable: true },
    revisitOn: { type: 'string', format: 'date', nullable: true },
    source: { type: 'string', enum: ['MANUAL', 'SCHEDULED_REVISIT'] },
  },
};
const leadResponse = (description: string) =>
  ApiResponse({ status: 200, description, schema: leadSchema });

export const DocListLeads = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Paginated leads in the caller’s permitted scope.',
      schema: pageSchema(leadSchema),
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR),
  );

const duplicateSuspected: DocumentedError = {
  status: 409,
  codes: ['LEAD_DUPLICATE_SUSPECTED'],
  when: 'A visible or hidden lead already has the same normalised phone. Review via POST /leads/duplicate-check, then resend with `acknowledgeDuplicates: true`.',
};

export const DocCreateLead = () =>
  applyDecorators(
    ApiResponse({ status: 201, description: 'Created lead record.', schema: leadSchema }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, duplicateSuspected, relationshipConflict),
  );

const candidateSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'companyName', 'phone', 'stage', 'ownerName', 'matchedOn', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    companyName: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    stage: { type: 'string' },
    ownerName: { type: 'string' },
    matchedOn: { type: 'array', items: { type: 'string', enum: ['PHONE', 'COMPANY'] } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const DocDuplicateCheck = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Possible duplicates the caller may see, plus a count of matches they may not.',
      schema: {
        type: 'object',
        required: ['candidates', 'hiddenMatchCount'],
        properties: {
          candidates: { type: 'array', items: candidateSchema },
          hiddenMatchCount: { type: 'integer' },
        },
      },
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR),
  );

const reminderSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'leadId',
    'dueAt',
    'status',
    'attempts',
    'lastAttemptAt',
    'sentAt',
    'reason',
    'recipientName',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    leadId: { type: 'string', format: 'uuid' },
    dueAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] },
    attempts: { type: 'integer' },
    lastAttemptAt: { type: 'string', format: 'date-time', nullable: true },
    sentAt: { type: 'string', format: 'date-time', nullable: true },
    reason: {
      type: 'string',
      nullable: true,
      enum: [
        'SMTP_NOT_CONFIGURED',
        'DELIVERY_FAILED',
        'LEAD_NOT_ACTIVE',
        'FOLLOW_UP_CHANGED',
        'RECIPIENT_UNAVAILABLE',
        'TOO_OVERDUE',
        null,
      ],
    },
    recipientName: { type: 'string' },
  },
};

const relationshipConflict: DocumentedError = {
  status: 409,
  codes: ['LEAD_COMPANY_UNAVAILABLE', 'LEAD_COMPANY_ARCHIVED', 'LEAD_CONTACT_UNAVAILABLE'],
  when: 'The company is unknown, not visible to the caller or archived, or a contact is not an active contact of that company. Unknown and invisible ids are not distinguished.',
};

export const DocSetLeadRelationships = () =>
  applyDecorators(
    leadResponse('Lead with its updated company and contacts.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, relationshipConflict),
  );

export const DocLeadReminders = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Paged reminder delivery records, newest follow-up first.',
      schema: pageSchema(reminderSchema),
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );

export const DocGetLead = () =>
  applyDecorators(
    leadResponse('Lead details.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );

export const DocLeadHistory = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Paged, immutable stage history.',
      schema: pageSchema(historySchema),
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound),
  );

export const DocUpdateLead = () =>
  applyDecorators(
    leadResponse('Updated lead record.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound, duplicateSuspected),
  );

export const DocTransitionLead = () =>
  applyDecorators(
    leadResponse('Updated lead.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      leadNotFound,
      lifecycleConflict(
        ['INVALID_STAGE_TRANSITION', 'QUALIFICATION_NOTE_REQUIRED'],
        'The lead cannot move to that stage from where it is (stages only move forward one step), or moving to Qualified needs a note.',
      ),
    ),
  );

export const DocDisqualifyLead = () =>
  applyDecorators(
    leadResponse('Disqualified lead.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      leadNotFound,
      lifecycleConflict(
        [
          'INVALID_DISQUALIFICATION_REASON',
          'REVISIT_DATE_REQUIRED',
          'REVISIT_DATE_NOT_ALLOWED',
          'INVALID_STAGE_TRANSITION',
        ],
        'The reason is not a valid one; a revisit-later reason needs a follow-up date and no other reason may have one; or the lead is not in a stage that can be disqualified.',
      ),
    ),
  );

export const DocMarkLeadLost = () =>
  applyDecorators(
    leadResponse('Lead marked Lost with retained reason.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      leadNotFound,
      lifecycleConflict(
        ['LOST_REASON_REQUIRED', 'INVALID_STAGE_TRANSITION'],
        'A reason is required to mark a lead lost, or the lead is not in a stage that can be lost.',
      ),
    ),
  );
