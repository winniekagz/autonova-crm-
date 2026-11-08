import { requestIdOf } from '../../../common/request-id.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@autonova/enums';
import type {
  LeadDto,
  LeadDuplicateCheckResult,
  LeadReminderDto,
  LeadStageHistoryDto,
  Paginated,
} from '@autonova/contracts';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import {
  DocCreateLead,
  DocDuplicateCheck,
  DocLeadReminders,
  DocDisqualifyLead,
  DocGetLead,
  DocLeadHistory,
  DocListLeads,
  DocMarkLeadLost,
  DocTransitionLead,
  DocSetLeadRelationships,
  DocUpdateLead,
} from './leads.docs.js';
import { createLeadBody, leadRelationshipsBody, updateLeadBody } from './leads.bodies.js';
import { LeadDuplicatesService } from '../application/lead-duplicates.service.js';
import { LeadsUseCases } from '../application/leads.use-cases.js';
import {
  createLeadSchema,
  duplicateCheckSchema,
  leadIdSchema,
  leadRelationshipsSchema,
  leadRemindersQuerySchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  disqualifyLeadSchema,
  leadHistoryQuerySchema,
  loseLeadSchema,
  transitionLeadSchema,
  type CreateLeadBody,
  type DuplicateCheckBody,
  type DisqualifyLeadBody,
  type LeadHistoryQuery,
  type LeadRelationshipsBody,
  type ListLeadsQuery,
  type LoseLeadBody,
  type TransitionLeadBody,
  type UpdateLeadBody,
} from './leads.schemas.js';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsUseCases,
    private readonly duplicates: LeadDuplicatesService,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.LeadsList)
  @ApiOperation({
    summary: 'List leads in the caller’s permitted pipeline scope',
    description:
      'Directors can list all leads. Business Development users can list only leads they own. Use `q` to search lead name, company, email, and phone.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '1-based page; defaults to 1.',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Defaults to 25; maximum 100.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Optional search string (1–100 characters).',
  })
  @DocListLeads()
  list(
    @Query({ schema: listLeadsQuerySchema }) query: ListLeadsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<LeadDto>> {
    return this.leads.list(query, user);
  }

  @Post()
  @RequirePermission(PermissionKey.LeadsCreate)
  @ApiOperation({
    summary: 'Create a lead owned by the caller in the New Lead stage',
    description:
      'The server assigns the lead to the current user and sets its initial stage. For source `REFERRAL`, include `referrerName`. Amounts are decimal strings; do not send currency symbols.',
  })
  @ApiBody(createLeadBody)
  @DocCreateLead()
  create(
    @Body({ schema: createLeadSchema }) body: CreateLeadBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.create(body, user, requestIdOf(request));
  }

  @Post('duplicate-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.LeadsCreate)
  @ApiOperation({
    summary: 'Check a phone number against existing leads',
    description:
      'Phone numbers are compared by digits (so `0712 345 678` equals `+254712345678`). Several leads for one company are expected, so the company is not compared here; see `POST /companies/duplicate-check`. Only leads the caller may read are described; matches in other pipelines are only counted.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        phone: { type: 'string', maxLength: 40 },
        excludeLeadId: { type: 'string', format: 'uuid', description: 'The lead being edited.' },
      },
    },
  })
  @DocDuplicateCheck()
  duplicateCheck(
    @Body({ schema: duplicateCheckSchema }) body: DuplicateCheckBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadDuplicateCheckResult> {
    return this.duplicates.check(body, user);
  }

  @Get(':id')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiOperation({
    summary: 'View a lead in the caller’s permitted pipeline scope',
    description: 'BD users receive only their own leads; Directors can read any lead.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Lead UUID returned from create or list.' })
  @DocGetLead()
  get(
    @Param('id', { schema: leadIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadDto> {
    return this.leads.get(id, user);
  }

  @Get(':id/history')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '1-based page; defaults to 1.',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Defaults to 25; maximum 100.',
  })
  @ApiOperation({ summary: 'Read a lead’s lifecycle history' })
  @DocLeadHistory()
  history(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Query({ schema: leadHistoryQuerySchema }) query: LeadHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<LeadStageHistoryDto>> {
    return this.leads.history(id, query, user);
  }

  @Get(':id/reminders')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '1-based page; defaults to 1.',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Defaults to 25; maximum 100.',
  })
  @ApiOperation({
    summary: 'Read a lead’s next-action reminder delivery records',
    description:
      'One record per follow-up instant, with delivery status, attempts and the reason for any failure or skip. Reminders are sent by the scheduled `leads:send-reminders` worker.',
  })
  @DocLeadReminders()
  reminders(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Query({ schema: leadRemindersQuerySchema }) query: LeadHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<LeadReminderDto>> {
    return this.leads.reminders(id, query, user);
  }

  @Patch(':id/relationships')
  @RequirePermission(PermissionKey.LeadsUpdate, PermissionKey.CompaniesRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Link a lead to a company and its contacts',
    description:
      'Replaces the lead’s company, primary contact and additional contacts in one step. `companyId: null` makes it an individual prospect (and requires no contacts). The company must be visible to the caller and not archived; every contact must be an active contact of that company. BD users can change only their own leads.',
  })
  @ApiBody(leadRelationshipsBody)
  @DocSetLeadRelationships()
  setRelationships(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Body({ schema: leadRelationshipsSchema }) body: LeadRelationshipsBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.setRelationships(id, body, user, requestIdOf(request));
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.LeadsUpdate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fromStage', 'toStage'],
      properties: {
        fromStage: {
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
        toStage: {
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
        reason: { type: 'string', maxLength: 1000 },
      },
    },
  })
  @ApiOperation({
    summary: 'Move a lead through an approved forward pipeline transition',
    description:
      'The caller supplies the stage they observed to prevent stale updates. Won, Lost, and Disqualified use dedicated operations; Won can only be reached by the future signed-ToR conversion workflow.',
  })
  @DocTransitionLead()
  transition(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Body({ schema: transitionLeadSchema }) body: TransitionLeadBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.transition(id, body, user, requestIdOf(request));
  }

  @Post(':id/disqualification')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.LeadsUpdate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fromStage', 'reason'],
      properties: {
        fromStage: { type: 'string', enum: ['VISITS_AND_CALLS'] },
        reason: {
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
        },
        revisitOn: {
          type: 'string',
          format: 'date',
          description: 'Required for TIMING_REVISIT_LATER; otherwise omit.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Disqualify a lead and optionally schedule revisit later',
    description:
      'A follow-up date is mandatory only for TIMING_REVISIT_LATER. Due records are processed by the leads:process-revisits scheduled worker.',
  })
  @DocDisqualifyLead()
  disqualify(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Body({ schema: disqualifyLeadSchema }) body: DisqualifyLeadBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.disqualify(id, body, user, requestIdOf(request));
  }

  @Post(':id/lost')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.LeadsUpdate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fromStage', 'reason'],
      properties: {
        fromStage: { type: 'string', enum: ['TOR_QUOTE_SENT'] },
        reason: { type: 'string', minLength: 1, maxLength: 1000 },
      },
    },
  })
  @ApiOperation({
    summary: 'Mark a ToR-sent lead Lost and retain its reason',
    description:
      'Requires a non-empty reason. Reopening Lost is not exposed because the policy is unresolved.',
  })
  @DocMarkLeadLost()
  markLost(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Body({ schema: loseLeadSchema }) body: LoseLeadBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.markLost(id, body, user, requestIdOf(request));
  }

  @Patch(':id')
  @RequirePermission(PermissionKey.LeadsUpdate)
  @ApiOperation({
    summary: 'Update lead details and next follow-up action',
    description:
      'Only supplied fields change. Ownership and pipeline stage cannot be changed through this endpoint. BD users can update only their own leads.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Lead UUID returned from create or list.' })
  @ApiBody(updateLeadBody)
  @DocUpdateLead()
  update(
    @Param('id', { schema: leadIdSchema }) id: string,
    @Body({ schema: updateLeadSchema }) body: UpdateLeadBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.leads.update(id, body, user, requestIdOf(request));
  }
}
