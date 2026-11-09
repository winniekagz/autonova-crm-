import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStage, LeadTransitionSource } from '@autonova/enums';
import type { Paginated, LeadDto } from '@autonova/contracts';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LeadRemindersRepository } from '../infrastructure/lead-reminders.repository.js';
import { LeadsRepository } from '../infrastructure/leads.repository.js';
import { CompaniesRepository } from '../../companies/infrastructure/companies.repository.js';
import { ContactsRepository } from '../../companies/infrastructure/contacts.repository.js';
import { companyVisibility } from '../../companies/application/company-scope.js';
import { validateLeadLinks, type LeadLinks } from '../domain/lead-relationships.js';
import { LeadDuplicatesService } from './lead-duplicates.service.js';
import { scopeFor } from './lead-scope.js';
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
  LeadRelationshipsBody,
  LoseLeadBody,
  TransitionLeadBody,
  UpdateLeadBody,
  UpdateLeadFields,
} from '../presentation/leads.schemas.js';

const NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
const LINK_MESSAGES = {
  CONTACT_REQUIRES_COMPANY: 'Choose a company before choosing contacts.',
  DUPLICATE_CONTACT: 'Each contact can be linked to a lead only once.',
  TOO_MANY_CONTACTS: 'A lead can have at most 20 additional contacts.',
} as const;
const COMPANY_UNAVAILABLE = {
  code: 'LEAD_COMPANY_UNAVAILABLE',
  message: 'That company is not available. Choose a company from your list.',
};
const CONTACT_UNAVAILABLE = {
  code: 'LEAD_CONTACT_UNAVAILABLE',
  message: 'Each contact must be an active contact of the lead’s company.',
};
const COMPANY_ARCHIVED_FOR_LEAD = {
  code: 'LEAD_COMPANY_ARCHIVED',
  message: 'That company is archived. Restore it before linking leads to it.',
};
const LIFECYCLE_MESSAGES = {
  INVALID_STAGE_TRANSITION: 'This lead cannot move between those stages.',
  QUALIFICATION_NOTE_REQUIRED: 'Add a note confirming the qualification result.',
  USE_QUALIFY_ENDPOINT:
    'Record a BANT assessment and use Qualify: a lead cannot be moved to Qualified any other way.',
  LOST_REASON_REQUIRED: 'Enter a reason for marking this lead lost.',
  INVALID_DISQUALIFICATION_REASON: 'Choose a valid disqualification reason.',
  REVISIT_DATE_REQUIRED: 'Choose a follow-up date for revisit later.',
  REVISIT_DATE_NOT_ALLOWED: 'A follow-up date is only used for revisit later.',
  LEAD_STAGE_CHANGED: 'The lead changed while you were working. Reload and try again.',
} as const;

@Injectable()
export class LeadsUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
    private readonly duplicates: LeadDuplicatesService,
    private readonly reminderRecords: LeadRemindersRepository,
    private readonly companies: CompaniesRepository,
    private readonly contacts: ContactsRepository,
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
    const { acknowledgeDuplicates, companyId, primaryContactId, additionalContactIds, ...fields } =
      input;
    const links = {
      companyId: companyId ?? null,
      primaryContactId: primaryContactId ?? null,
      additionalContactIds: additionalContactIds ?? [],
    };
    await this.assertLinksAllowed(links, user);
    const duplicateAcknowledged = await this.duplicates.assertAcknowledged(
      this.duplicates.keysOf(fields),
      undefined,
      user,
      acknowledgeDuplicates === true,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await this.leads.create(fields, links, user.id, tx);
      await this.audit.record(tx, {
        action: 'lead.created',
        entityType: 'lead',
        entityId: created.id,
        actorUserId: user.id,
        newValues: {
          stage: created.stage,
          source: created.source,
          ownerUserId: created.ownerUserId,
          companyId: links.companyId,
          duplicateAcknowledged,
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
    const { acknowledgeDuplicates, ...fields } = input;
    const duplicateAcknowledged = await this.checkChangedKeys(
      id,
      fields,
      user,
      acknowledgeDuplicates,
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await this.leads.update(id, fields, scopeFor(user), tx);
      if (!updated) throw new NotFoundException(NOT_FOUND);
      const changed = {
        ...Object.fromEntries(Object.keys(fields).map((key) => [`${key}Changed`, true])),
        ...(duplicateAcknowledged ? { duplicateAcknowledged } : {}),
      };
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

  /** Only a phone that actually changes is checked, so editing a known duplicate stays possible. */
  private async checkChangedKeys(
    id: string,
    fields: UpdateLeadFields,
    user: AuthenticatedUser,
    acknowledged: boolean | undefined,
  ): Promise<boolean> {
    if (fields.phone === undefined) return false;
    const current = await this.leads.findForLifecycle(id, scopeFor(user));
    if (!current) throw new NotFoundException(NOT_FOUND);
    const next = this.duplicates.keysOf(fields);
    return this.duplicates.assertAcknowledged(
      { phone: next.phone !== current.phoneNormalized ? next.phone : null },
      id,
      user,
      acknowledged === true,
    );
  }

  /**
   * Changes the company and contacts of a lead. The caller must own the lead (Directors: any lead) and
   * be allowed to see the company; contacts must be active contacts of that same company.
   */
  async setRelationships(
    id: string,
    input: LeadRelationshipsBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    const links = {
      companyId: input.companyId,
      primaryContactId: input.primaryContactId,
      additionalContactIds: input.additionalContactIds,
    };
    await this.assertLinksAllowed(links, user);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.leads.findForLifecycle(id, scopeFor(user), tx);
      if (!current) throw new NotFoundException(NOT_FOUND);
      const before = await this.leads.linksOf(tx, id);
      await this.leads.setRelationships(tx, id, links);
      await this.audit.record(tx, {
        action: 'lead.relationships_changed',
        entityType: 'lead',
        entityId: id,
        actorUserId: user.id,
        oldValues: {
          companyId: before?.companyId ?? null,
          primaryContactId: before?.primaryContactId ?? null,
          additionalContactCount: before?.contacts.length ?? 0,
        },
        newValues: {
          companyId: links.companyId,
          primaryContactId: links.primaryContactId,
          additionalContactCount: links.additionalContactIds.length,
        },
        requestId,
      });
    });
    const dto = await this.leads.get(id, scopeFor(user));
    if (!dto) throw new NotFoundException(NOT_FOUND);
    return dto;
  }

  /**
   * Validates a company/contact selection against the data and the caller's visibility. Unknown, invisible
   * and foreign-company ids all produce the same answer, so ids cannot be probed.
   */
  private async assertLinksAllowed(links: LeadLinks, user: AuthenticatedUser): Promise<void> {
    const shape = validateLeadLinks(links);
    if (!shape.ok) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: LINK_MESSAGES[shape.code],
        details: [{ path: 'companyId', message: LINK_MESSAGES[shape.code] }],
      });
    }
    if (!links.companyId) return;
    const company = await this.companies.findVisible(links.companyId, companyVisibility(user));
    if (!company) throw new ConflictException(COMPANY_UNAVAILABLE);
    if (company.archivedAt) throw new ConflictException(COMPANY_ARCHIVED_FOR_LEAD);
    const wanted = [
      ...(links.primaryContactId ? [links.primaryContactId] : []),
      ...links.additionalContactIds,
    ];
    if (wanted.length === 0) return;
    const found = await this.contacts.contactsOfCompany(links.companyId, wanted);
    const active = new Set(found.filter((row) => row.archivedAt === null).map((row) => row.id));
    if (wanted.some((contactId) => !active.has(contactId))) {
      throw new ConflictException(CONTACT_UNAVAILABLE);
    }
  }

  async history(id: string, query: LeadHistoryQuery, user: AuthenticatedUser) {
    const result = await this.leads.history(id, scopeFor(user), query.page, query.pageSize);
    if (!result) throw new NotFoundException(NOT_FOUND);
    return result;
  }

  async reminders(id: string, query: LeadHistoryQuery, user: AuthenticatedUser) {
    const result = await this.reminderRecords.listForLead(
      id,
      scopeFor(user),
      query.page,
      query.pageSize,
    );
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
