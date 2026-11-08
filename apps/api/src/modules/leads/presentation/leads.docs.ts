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

const leadSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'companyName', 'phone', 'email', 'source', 'referrerName', 'productInterest', 'notes', 'estimatedValue', 'currency', 'stage', 'lifecycle', 'lostReason', 'lostAt', 'disqualificationReason', 'revisitOn', 'ownerUserId', 'ownerName', 'nextAction', 'nextActionAt', 'probability', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, companyName: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true }, email: { type: 'string', format: 'email', nullable: true },
    source: { type: 'string', enum: ['REFERRAL', 'INSTAGRAM', 'WEBSITE', 'WALK_IN', 'EVENT', 'COLD_OUTREACH', 'EXISTING_CLIENT_UPSELL'] },
    referrerName: { type: 'string', nullable: true }, productInterest: { type: 'string', nullable: true }, notes: { type: 'string', nullable: true },
    estimatedValue: { type: 'string', nullable: true }, currency: { type: 'string', enum: ['KES', 'USD'] },
    stage: { type: 'string', enum: ['NEW_LEAD', 'VISITS_AND_CALLS', 'QUALIFIED', 'SCOPE_ALIGNMENT', 'TOR_QUOTE_SENT', 'DISQUALIFIED', 'WON', 'LOST'] },
    lifecycle: { type: 'object', required: ['transitions', 'canDisqualify', 'canMarkLost'], properties: { transitions: { type: 'array', items: { type: 'string' } }, canDisqualify: { type: 'boolean' }, canMarkLost: { type: 'boolean' } } },
    lostReason: { type: 'string', nullable: true }, lostAt: { type: 'string', format: 'date-time', nullable: true },
    disqualificationReason: { type: 'string', enum: ['NO_BUDGET', 'NO_DECISION_MAKER', 'NEED_DOES_NOT_FIT', 'CHOSE_COMPETITOR', 'UNRESPONSIVE', 'TIMING_REVISIT_LATER', 'OTHER'], nullable: true }, revisitOn: { type: 'string', format: 'date', nullable: true },
    ownerUserId: { type: 'string', format: 'uuid' }, ownerName: { type: 'string' }, nextAction: { type: 'string' },
    nextActionAt: { type: 'string', format: 'date-time' }, probability: { type: 'integer', nullable: true },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
  },
};
const pageSchema = (item: SchemaObject): SchemaObject => ({ type: 'object', required: ['items', 'page', 'pageSize', 'total'], properties: { items: { type: 'array', items: item }, page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' } } });
const historySchema: SchemaObject = {
  type: 'object', required: ['id', 'leadId', 'fromStage', 'toStage', 'actorUserId', 'actorName', 'occurredAt', 'reason', 'disqualificationReason', 'revisitOn', 'source'],
  properties: { id: { type: 'string', format: 'uuid' }, leadId: { type: 'string', format: 'uuid' }, fromStage: { type: 'string', nullable: true }, toStage: { type: 'string' }, actorUserId: { type: 'string', format: 'uuid', nullable: true }, actorName: { type: 'string', nullable: true }, occurredAt: { type: 'string', format: 'date-time' }, reason: { type: 'string', nullable: true }, disqualificationReason: { type: 'string', nullable: true }, revisitOn: { type: 'string', format: 'date', nullable: true }, source: { type: 'string', enum: ['MANUAL', 'SCHEDULED_REVISIT'] } },
};
const leadResponse = (description: string) => ApiResponse({ status: 200, description, schema: leadSchema });

export const DocListLeads = () => applyDecorators(ApiResponse({ status: 200, description: 'Paginated leads in the caller’s permitted scope.', schema: pageSchema(leadSchema) }), ApiErrors(...privateErrors, VALIDATION_ERROR));

export const DocCreateLead = () => applyDecorators(ApiResponse({ status: 201, description: 'Created lead record.', schema: leadSchema }), ApiErrors(...privateErrors, VALIDATION_ERROR));

export const DocGetLead = () =>
  applyDecorators(leadResponse('Lead details.'), ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound));

export const DocLeadHistory = () =>
  applyDecorators(ApiResponse({ status: 200, description: 'Paged, immutable stage history.', schema: pageSchema(historySchema) }), ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound));

export const DocUpdateLead = () =>
  applyDecorators(leadResponse('Updated lead record.'), ApiErrors(...privateErrors, VALIDATION_ERROR, leadNotFound));

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
