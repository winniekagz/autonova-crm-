import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStage, LeadTransitionSource } from '@autonova/enums';
import type { Paginated, LeadDto } from '@autonova/contracts';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LeadsRepository } from '../infrastructure/leads.repository.js';
import {
  validateDisqualification,
  validateLeadTransition,
  validateLostReason,
} from '../domain/lead-lifecycle.js';
import type {
  CreateLeadBody,
  DisqualifyLeadBody,
  LeadHistoryQuery,
  ListLeadsQuery,
  LoseLeadBody,
  TransitionLeadBody,
  UpdateLeadBody,
} from '../presentation/leads.schemas.js';

const NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
const LIFECYCLE_MESSAGES = {
  INVALID_STAGE_TRANSITION: 'This lead cannot move between those stages.',
  QUALIFICATION_NOTE_REQUIRED: 'Add a note confirming the qualification result.',
  LOST_REASON_REQUIRED: 'Enter a reason for marking this lead lost.',
  INVALID_DISQUALIFICATION_REASON: 'Choose a valid disqualification reason.',
  REVISIT_DATE_REQUIRED: 'Choose a follow-up date for revisit later.',
  REVISIT_DATE_NOT_ALLOWED: 'A follow-up date is only used for revisit later.',
  LEAD_STAGE_CHANGED: 'The lead changed while you were working. Reload and try again.',
} as const;
const scopeFor = (user: AuthenticatedUser) =>
  user.roles.includes('director') ? undefined : user.id;

@Injectable()
export class LeadsUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListLeadsQuery, user: AuthenticatedUser): Promise<Paginated<LeadDto>> {
    const { items, total } = await this.leads.list(query, scopeFor(user));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser): Promise<LeadDto> {
    const lead = await this.leads.get(id, scopeFor(user));
    if (!lead) throw new NotFoundException(NOT_FOUND);
    return lead;
  }

  async create(
    input: CreateLeadBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await this.leads.create(input, user.id, tx);
      await this.audit.record(tx, {
        action: 'lead.created',
        entityType: 'lead',
        entityId: created.id,
        actorUserId: user.id,
        newValues: {
          stage: created.stage,
          source: created.source,
          ownerUserId: created.ownerUserId,
        },
        requestId,
      });
      return created;
    });
    const dto = await this.leads.get(row.id);
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  async update(
    id: string,
    input: UpdateLeadBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await this.leads.update(id, input, scopeFor(user), tx);
      if (!updated) throw new NotFoundException(NOT_FOUND);
      const changed = Object.fromEntries(Object.keys(input).map((key) => [`${key}Changed`, true]));
      await this.audit.record(tx, {
        action: 'lead.updated',
        entityType: 'lead',
        entityId: id,
        actorUserId: user.id,
        newValues: changed,
        requestId,
      });
    });
    const dto = await this.leads.get(id, scopeFor(user));
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  async history(id: string, query: LeadHistoryQuery, user: AuthenticatedUser) {
    const result = await this.leads.history(id, scopeFor(user), query.page, query.pageSize);
    if (!result) throw new NotFoundException(NOT_FOUND);
    return result;
  }

  async transition(
    id: string,
    input: TransitionLeadBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    const result = validateLeadTransition(input.fromStage, input.toStage, input.reason);
    if (!result.ok) this.throwLifecycle(result.code);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.leads.findForLifecycle(id, scopeFor(user), tx);
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (current.stage !== input.fromStage) this.throwLifecycle('LEAD_STAGE_CHANGED');
      const updated = await this.leads.compareAndSetStage(tx, {
        id,
        fromStage: input.fromStage,
        data: { stage: input.toStage },
      });
      if (updated.count !== 1) this.throwLifecycle('LEAD_STAGE_CHANGED');
      await this.leads.createHistory(tx, {
        leadId: id,
        fromStage: input.fromStage,
        toStage: input.toStage,
        actorUserId: user.id,
        reason: input.reason?.trim() || null,
        source: LeadTransitionSource.Manual,
      });
      await this.audit.record(tx, {
        action: 'lead.stage_changed',
        entityType: 'lead',
        entityId: id,
        actorUserId: user.id,
        oldValues: { stage: input.fromStage },
        newValues: { stage: input.toStage },
        reason: input.reason?.trim(),
        requestId,
      });
    });
    const dto = await this.leads.get(id, scopeFor(user));
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  async disqualify(
    id: string,
    input: DisqualifyLeadBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    const result = validateDisqualification(input.reason, input.revisitOn);
    if (!result.ok) this.throwLifecycle(result.code);
    const revisitOn = input.revisitOn ? new Date(`${input.revisitOn}T00:00:00.000Z`) : null;
    await this.prisma.$transaction(async (tx) => {
      const current = await this.leads.findForLifecycle(id, scopeFor(user), tx);
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (current.stage !== input.fromStage) this.throwLifecycle('LEAD_STAGE_CHANGED');
      const changed = await this.leads.compareAndSetStage(tx, {
        id,
        fromStage: input.fromStage,
        data: {
          stage: LeadStage.Disqualified,
          disqualificationReason: input.reason,
          disqualifiedAt: new Date(),
          disqualifiedByUserId: user.id,
          revisitOn,
        },
      });
      if (changed.count !== 1) this.throwLifecycle('LEAD_STAGE_CHANGED');
      await this.leads.createHistory(tx, {
        leadId: id,
        fromStage: input.fromStage,
        toStage: LeadStage.Disqualified,
        actorUserId: user.id,
        disqualificationReason: input.reason,
        revisitOn,
        source: LeadTransitionSource.Manual,
      });
      await this.audit.record(tx, {
        action: 'lead.disqualified',
        entityType: 'lead',
        entityId: id,
        actorUserId: user.id,
        oldValues: { stage: input.fromStage },
        newValues: {
          stage: LeadStage.Disqualified,
          reason: input.reason,
          revisitOn: input.revisitOn,
        },
        reason: input.reason,
        requestId,
      });
    });
    const dto = await this.leads.get(id, scopeFor(user));
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  async markLost(
    id: string,
    input: LoseLeadBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    const result = validateLostReason(input.reason);
    if (!result.ok) this.throwLifecycle(result.code);
    const reason = input.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.leads.findForLifecycle(id, scopeFor(user), tx);
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (current.stage !== input.fromStage) this.throwLifecycle('LEAD_STAGE_CHANGED');
      const changed = await this.leads.compareAndSetStage(tx, {
        id,
        fromStage: input.fromStage,
        data: {
          stage: LeadStage.Lost,
          lostReason: reason,
          lostAt: new Date(),
          lostByUserId: user.id,
        },
      });
      if (changed.count !== 1) this.throwLifecycle('LEAD_STAGE_CHANGED');
      await this.leads.createHistory(tx, {
        leadId: id,
        fromStage: input.fromStage,
        toStage: LeadStage.Lost,
        actorUserId: user.id,
        reason,
        source: LeadTransitionSource.Manual,
      });
      await this.audit.record(tx, {
        action: 'lead.lost',
        entityType: 'lead',
        entityId: id,
        actorUserId: user.id,
        oldValues: { stage: input.fromStage },
        newValues: { stage: LeadStage.Lost, reason },
        reason,
        requestId,
      });
    });
    const dto = await this.leads.get(id, scopeFor(user));
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  private throwLifecycle(code: keyof typeof LIFECYCLE_MESSAGES): never {
    throw new ConflictException({ code, message: LIFECYCLE_MESSAGES[code] });
  }
}
