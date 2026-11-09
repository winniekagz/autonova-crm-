import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStage, LeadTransitionSource } from '@autonova/enums';
import type {
  LeadDto,
  Paginated,
  QualificationDto,
  QualificationSettingsDto,
} from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { SETTING_KEYS, SettingsService } from '../../settings/application/settings.service.js';
import { SettingsRepository } from '../../settings/infrastructure/settings.repository.js';
import {
  decideQualification,
  passesBant,
  scoreBant,
  validateBantSettings,
  type BantSettingsProblem,
} from '../domain/bant.js';
import {
  QualificationRepository,
  toQualificationDto,
} from '../infrastructure/qualification.repository.js';
import type {
  AssessBody,
  BantSettingsBody,
  QualifyBody,
} from '../presentation/qualification.schemas.js';

const LEAD_NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
const STAGE_CHANGED = {
  code: 'LEAD_STAGE_CHANGED',
  message: 'The lead changed while you were working. Reload and try again.',
};
const NOT_IN_STAGE = {
  code: 'QUALIFICATION_WRONG_STAGE',
  message: 'A BANT assessment is recorded while the lead is in Visits and calls.',
};
const DECISION_MESSAGES = {
  QUALIFICATION_NOT_ASSESSED: 'Record a BANT assessment before qualifying this lead.',
  QUALIFICATION_NOT_PASSED:
    'The latest BANT assessment did not reach the pass mark. A Director can qualify it with a written reason.',
  OVERRIDE_REQUIRES_DIRECTOR: 'Only a Director can qualify a lead that did not pass.',
} as const;
const SETTINGS_MESSAGES: Record<BantSettingsProblem, string> = {
  WEIGHTS_MUST_TOTAL_100: 'The four weights must add up to exactly 100.',
  WEIGHT_OUT_OF_RANGE: 'Each weight must be a whole number from 0 to 100.',
  PASS_MARK_OUT_OF_RANGE: 'The pass mark must be a whole number from 1 to 100.',
};

@Injectable()
export class QualificationUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qualifications: QualificationRepository,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly settingsStore: SettingsRepository,
  ) {}

  private async requireLead(leadId: string, user: AuthenticatedUser) {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException(LEAD_NOT_FOUND);
    return lead;
  }

  async current(leadId: string, user: AuthenticatedUser): Promise<QualificationDto | null> {
    await this.requireLead(leadId, user);
    const latest = await this.qualifications.latest(leadId);
    return latest ? toQualificationDto(latest) : null;
  }

  async history(leadId: string, page: number, pageSize: number, user: AuthenticatedUser) {
    await this.requireLead(leadId, user);
    return this.qualifications.list(leadId, page, pageSize) as Promise<Paginated<QualificationDto>>;
  }

  /** Scores the four ratings with the settings in force and stores the result, never a client-sent score. */
  async assess(
    leadId: string,
    input: AssessBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<QualificationDto> {
    const lead = await this.requireLead(leadId, user);
    if (lead.stage !== LeadStage.VisitsAndCalls) throw new ConflictException(NOT_IN_STAGE);
    const config = await this.settings.bant();
    const ratings = {
      budget: input.budget,
      authority: input.authority,
      need: input.need,
      timeline: input.timeline,
    };
    const score = scoreBant(ratings, config);
    const passed = passesBant(score, config.passMark);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await this.qualifications.create(tx, {
        leadId,
        ratings,
        score,
        passMark: config.passMark,
        weights: { ...config.weights },
        passed,
        notes: input.notes?.trim() || null,
        assessedByUserId: user.id,
      });
      await this.audit.record(tx, {
        action: 'lead.qualification_assessed',
        entityType: 'lead',
        entityId: leadId,
        actorUserId: user.id,
        // Ratings and the result only; the free-text note is not copied into the audit trail.
        // Key names avoid `pass…`: the audit service refuses anything that looks like a credential.
        newValues: {
          ...ratings,
          score,
          threshold: config.passMark,
          result: passed ? 'MET' : 'NOT_MET',
        },
        requestId,
      });
      return created;
    });
    return toQualificationDto(row);
  }

  /**
   * Moves the lead to Qualified. Passing needs no override; a failing assessment needs a Director and a
   * reason (PRD 4.4). The decision, the assessment relied on and any override are written to the stage
   * history and the audit trail in the same transaction as the stage change.
   */
  async qualify(
    leadId: string,
    input: QualifyBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<LeadDto> {
    await this.requireLead(leadId, user);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.leads.findForLifecycle(leadId, scopeFor(user), tx);
      if (!current) throw new NotFoundException(LEAD_NOT_FOUND);
      if (current.stage !== input.fromStage) throw new ConflictException(STAGE_CHANGED);
      const latest = await this.qualifications.latest(leadId, tx);
      const isDirector = user.roles.includes('director');
      const decision = decideQualification({
        latest,
        isDirector,
        overrideReason: input.overrideReason,
      });
      if (!decision.ok) {
        const body = { code: decision.code, message: DECISION_MESSAGES[decision.code] };
        if (decision.code === 'OVERRIDE_REQUIRES_DIRECTOR') throw new ForbiddenException(body);
        throw new ConflictException(body);
      }
      if (decision.overridden && !user.permissions.includes('qualification:override')) {
        throw new ForbiddenException({
          code: 'OVERRIDE_REQUIRES_DIRECTOR',
          message: DECISION_MESSAGES.OVERRIDE_REQUIRES_DIRECTOR,
        });
      }
      if (!latest) throw new ConflictException(STAGE_CHANGED);
      const changed = await this.leads.compareAndSetStage(tx, {
        id: leadId,
        fromStage: LeadStage.VisitsAndCalls,
        data: { stage: LeadStage.Qualified },
      });
      if (changed.count !== 1) throw new ConflictException(STAGE_CHANGED);
      const reason = decision.overridden
        ? `Director override: ${input.overrideReason?.trim() ?? ''}`
        : input.note?.trim() ||
          `BANT score ${latest.score} met the pass mark of ${latest.passMark}`;
      await this.leads.createHistory(tx, {
        leadId,
        fromStage: LeadStage.VisitsAndCalls,
        toStage: LeadStage.Qualified,
        actorUserId: user.id,
        reason,
        source: LeadTransitionSource.Manual,
        qualificationId: latest.id,
        qualificationOverride: decision.overridden,
      });
      await this.audit.record(tx, {
        action: decision.overridden ? 'lead.qualified_override' : 'lead.qualified',
        entityType: 'lead',
        entityId: leadId,
        actorUserId: user.id,
        oldValues: { stage: LeadStage.VisitsAndCalls },
        newValues: {
          stage: LeadStage.Qualified,
          score: latest.score,
          threshold: latest.passMark,
          result: latest.passed ? 'MET' : 'NOT_MET',
          overridden: decision.overridden,
        },
        reason,
        requestId,
      });
    });
    const dto = await this.leads.get(leadId, scopeFor(user));
    if (!dto) throw new NotFoundException(LEAD_NOT_FOUND);
    return dto;
  }

  settingsDto(): Promise<QualificationSettingsDto> {
    return this.settings.bantDto();
  }

  async updateSettings(
    input: BantSettingsBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<QualificationSettingsDto> {
    const problem = validateBantSettings(input);
    if (problem) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: SETTINGS_MESSAGES[problem],
        details: [{ path: 'weights', message: SETTINGS_MESSAGES[problem] }],
      });
    }
    const before = await this.settings.bant();
    await this.prisma.$transaction(async (tx) => {
      await this.settingsStore.write(tx, SETTING_KEYS.bant, input, user.id);
      await this.audit.record(tx, {
        action: 'settings.bant_updated',
        entityType: 'setting',
        entityId: SETTING_KEYS.bant,
        actorUserId: user.id,
        oldValues: { threshold: before.passMark, ...before.weights },
        newValues: { threshold: input.passMark, ...input.weights },
        requestId,
      });
    });
    return this.settings.bantDto();
  }
}
