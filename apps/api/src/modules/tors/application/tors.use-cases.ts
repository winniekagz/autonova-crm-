import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TorDto, TorVersionDiffDto, TorVersionDto } from '@autonova/contracts';
import { LeadStage, LeadTransitionSource } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { SettingsService } from '../../settings/application/settings.service.js';
import { NumberSequenceRepository } from '../../settings/infrastructure/number-sequence.repository.js';
import { discountNeedsApproval } from '../domain/tor-calculator.js';
import { contentHashOf } from '../domain/tor-content.js';
import { diffVersions } from '../domain/tor-diff.js';
import { parseMoney } from '../domain/money.js';
import {
  TorsRepository,
  toVersionDto,
  type VersionRow,
  type VersionWrite,
} from '../infrastructure/tors.repository.js';
import { CatalogueRepository } from '../infrastructure/catalogue.repository.js';
import type { TorVersionBody } from '../presentation/tors.schemas.js';
import { prepareVersion } from './tor-prepare.js';
import { hashableOf } from './tor-snapshot.js';

const LEAD_NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
export const TOR_NOT_FOUND = {
  code: 'TOR_NOT_FOUND',
  message: 'No Terms of Reference for this lead yet',
};
const VERSION_NOT_FOUND = {
  code: 'TOR_VERSION_NOT_FOUND',
  message: 'That ToR version does not exist',
};
const NOT_DRAFT = {
  code: 'TOR_VERSION_NOT_DRAFT',
  message:
    'This version was already sent, so it cannot be edited. Start a new version to record another round of changes.',
};
const ALREADY_OPEN = {
  code: 'TOR_VERSION_ALREADY_OPEN',
  message: 'There is already a version in progress. Edit it, or send or supersede it first.',
};
const SIGNED_LOCKED = {
  code: 'TOR_SIGNED',
  message:
    'This agreement is signed and locked. A later change is a change request, which is not available yet.',
};
const WRONG_STAGE = {
  code: 'TOR_LEAD_NOT_QUALIFIED',
  message: 'A Terms of Reference can be started once the lead is Qualified.',
};
@Injectable()
export class TorsUseCases {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly tors: TorsRepository,
    protected readonly leads: LeadsRepository,
    protected readonly audit: AuditService,
    protected readonly settings: SettingsService,
    protected readonly numbers: NumberSequenceRepository,
    protected readonly catalogue: CatalogueRepository,
  ) {}

  /** The lead, only if the caller may see it. Directors see all; everyone else their own leads. */
  async requireLead(leadId: string, user: AuthenticatedUser) {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException(LEAD_NOT_FOUND);
    return lead;
  }

  protected async requireTor(leadId: string, user: AuthenticatedUser) {
    const lead = await this.requireLead(leadId, user);
    const tor = await this.tors.findByLead(leadId);
    if (!tor) throw new NotFoundException(TOR_NOT_FOUND);
    return { lead, tor };
  }

  protected async dto(row: VersionRow): Promise<TorVersionDto> {
    const threshold = await this.settings.discountThresholdPercent();
    const needs =
      row.status === 'DRAFT' &&
      row.discountApprovedAt === null &&
      this.exceedsThreshold(row, threshold);
    return toVersionDto(row, needs);
  }

  protected exceedsThreshold(row: VersionRow, thresholdPercent: number): boolean {
    const discount = parseMoney(row.discountAmount.toString()) ?? 0n;
    const subtotal = parseMoney(row.oneOffSubtotal.toString()) ?? 0n;
    return discountNeedsApproval(discount, subtotal, BigInt(Math.round(thresholdPercent * 100)));
  }

  async get(leadId: string, user: AuthenticatedUser): Promise<TorDto> {
    const { tor } = await this.requireTor(leadId, user);
    return this.assemble(tor.id, tor.number, tor.leadId);
  }

  protected async assemble(torId: string, number: string, leadId: string): Promise<TorDto> {
    const [latest, versions, signed, account] = await Promise.all([
      this.tors.latestVersion(torId),
      this.tors.summaries(torId),
      this.prisma.torVersion.count({ where: { torId, status: 'SIGNED' } }),
      this.prisma.clientAccount.findFirst({ where: { torId }, select: { id: true } }),
    ]);
    if (!latest) throw new NotFoundException(VERSION_NOT_FOUND);
    return {
      id: torId,
      number,
      leadId,
      versions,
      current: await this.dto(latest),
      signed: signed > 0,
      clientAccountId: account?.id ?? null,
    };
  }

  async version(
    leadId: string,
    versionNo: number,
    user: AuthenticatedUser,
  ): Promise<TorVersionDto> {
    const { tor } = await this.requireTor(leadId, user);
    const row = await this.tors.versionByNo(tor.id, versionNo);
    if (!row) throw new NotFoundException(VERSION_NOT_FOUND);
    return this.dto(row);
  }

  async diff(
    leadId: string,
    fromNo: number,
    toNo: number,
    user: AuthenticatedUser,
  ): Promise<TorVersionDiffDto> {
    const { tor } = await this.requireTor(leadId, user);
    const [from, to] = await Promise.all([
      this.tors.versionByNo(tor.id, fromNo),
      this.tors.versionByNo(tor.id, toNo),
    ]);
    if (!from || !to) throw new NotFoundException(VERSION_NOT_FOUND);
    const shape = (row: VersionRow) => ({
      versionNo: row.versionNo,
      currency: row.currency,
      setupFee: row.setupFee.toString(),
      discountType: row.discountType,
      discountValue: row.discountValue.toString(),
      hostingAmount: row.hostingAmount.toString(),
      hostingCycle: row.hostingCycle,
      paymentTerms: row.paymentTerms,
      vatTreatment: row.vatTreatment,
      scopeItems: row.scopeItems.map((i) => ({
        itemKey: i.itemKey,
        name: i.name,
        inScope: i.inScope,
        estimateDays: i.estimateDays.toString(),
        price: i.price.toString(),
      })),
      addons: row.addons,
      milestones: row.milestones,
    });
    return diffVersions(shape(from), shape(to));
  }

  /** Creates the ToR with its first DRAFT version (v1). One ToR per lead. */
  async create(
    leadId: string,
    input: TorVersionBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<TorDto> {
    const lead = await this.requireLead(leadId, user);
    const startable: string[] = [
      LeadStage.Qualified,
      LeadStage.ScopeAlignment,
      LeadStage.TorQuoteSent,
    ];
    if (!startable.includes(lead.stage)) throw new ConflictException(WRONG_STAGE);
    if (await this.tors.findByLead(leadId)) {
      throw new ConflictException({
        code: 'TOR_EXISTS',
        message: 'This lead already has a Terms of Reference. Open it to continue.',
      });
    }
    const write = await prepareVersion(this.catalogue, input, null);
    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next(tx, 'TOR');
      const tor = await this.tors.createTor(tx, { number, leadId, actorUserId: user.id });
      const version = await this.tors.createVersion(tx, {
        torId: tor.id,
        versionNo: 1,
        actorUserId: user.id,
        write,
      });
      // Starting scope alignment is part of creating the agreement, so the pipeline always agrees with it.
      if (lead.stage === LeadStage.Qualified) {
        const moved = await this.leads.compareAndSetStage(tx, {
          id: leadId,
          fromStage: LeadStage.Qualified,
          data: { stage: LeadStage.ScopeAlignment },
        });
        if (moved.count !== 1) {
          throw new ConflictException({
            code: 'LEAD_STAGE_CHANGED',
            message: 'The lead changed while you were working. Reload and try again.',
          });
        }
        await this.leads.createHistory(tx, {
          leadId,
          fromStage: LeadStage.Qualified,
          toStage: LeadStage.ScopeAlignment,
          actorUserId: user.id,
          reason: `Terms of Reference ${number} started`,
          source: LeadTransitionSource.Manual,
        });
      }
      await this.audit.record(tx, {
        action: 'tor.created',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        newValues: { number, leadId, versionNo: 1, totalOneOff: write.totals.totalOneOff },
        requestId,
      });
      return { tor, version };
    });
    return this.assemble(created.tor.id, created.tor.number, leadId);
  }

  /** Edits the DRAFT version. A sent or signed version is refused here and again by the database. */
  async updateDraft(
    leadId: string,
    input: TorVersionBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<TorVersionDto> {
    const { tor } = await this.requireTor(leadId, user);
    const write = await prepareVersion(
      this.catalogue,
      input,
      await this.tors.latestVersion(tor.id),
    );
    const id = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      const latest = await this.tors.latestVersion(tor.id, tx);
      if (!latest) throw new NotFoundException(VERSION_NOT_FOUND);
      if (latest.status === 'SIGNED') throw new ConflictException(SIGNED_LOCKED);
      if (latest.status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
      // Item keys must continue from the version before this draft, not from the draft being replaced.
      const base =
        latest.versionNo > 1 ? await this.tors.versionByNo(tor.id, latest.versionNo - 1, tx) : null;
      const rewrite = base ? await prepareVersion(this.catalogue, input, base) : write;
      await this.tors.updateDraft(tx, latest.id, rewrite);
      await this.audit.record(tx, {
        action: 'tor.draft_updated',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        newValues: { versionNo: latest.versionNo, totalOneOff: rewrite.totals.totalOneOff },
        requestId,
      });
      return latest.id;
    });
    const row = await this.tors.versionRow(id);
    if (!row) throw new NotFoundException(VERSION_NOT_FOUND);
    return this.dto(row);
  }

  /**
   * Starts the next scope-alignment round as a new DRAFT version, copied from the latest one. The previous
   * sent version is marked SUPERSEDED so there is only ever one live version. A signed agreement is final.
   */
  async newVersion(
    leadId: string,
    input: TorVersionBody | null,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<TorVersionDto> {
    const { tor } = await this.requireTor(leadId, user);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      const latest = await this.tors.latestVersion(tor.id, tx);
      if (!latest) throw new NotFoundException(VERSION_NOT_FOUND);
      if (latest.status === 'SIGNED') throw new ConflictException(SIGNED_LOCKED);
      if (latest.status === 'DRAFT') throw new ConflictException(ALREADY_OPEN);
      if (latest.status !== 'SENT') throw new ConflictException(ALREADY_OPEN);
      const write = input
        ? await prepareVersion(this.catalogue, input, latest)
        : await this.copyOf(latest);
      const superseded = await this.tors.supersede(tx, latest.id);
      if (superseded.count !== 1) throw new ConflictException(ALREADY_OPEN);
      const created = await this.tors.createVersion(tx, {
        torId: tor.id,
        versionNo: latest.versionNo + 1,
        actorUserId: user.id,
        write,
      });
      await this.audit.record(tx, {
        action: 'tor.version_created',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        oldValues: { supersededVersionNo: latest.versionNo },
        newValues: { versionNo: created.versionNo },
        requestId,
      });
      return created.id;
    });
    const row = await this.tors.versionRow(id);
    if (!row) throw new NotFoundException(VERSION_NOT_FOUND);
    return this.dto(row);
  }

  protected async copyOf(row: VersionRow): Promise<VersionWrite> {
    const totals = {
      scopeTotal: row.scopeTotal.toString(),
      addonsTotal: row.addonsTotal.toString(),
      oneOffSubtotal: row.oneOffSubtotal.toString(),
      discountAmount: row.discountAmount.toString(),
      netOneOff: row.netOneOff.toString(),
      vatOneOff: row.vatOneOff.toString(),
      totalOneOff: row.totalOneOff.toString(),
      recurringVat: row.recurringVat.toString(),
      recurringTotal: row.recurringTotal.toString(),
    };
    return {
      currency: row.currency,
      setupFee: row.setupFee.toString(),
      discountType: row.discountType,
      discountValue: row.discountValue.toString(),
      hostingName: row.hostingName,
      hostingDescription: row.hostingDescription,
      hostingCycle: row.hostingCycle,
      hostingAmount: row.hostingAmount.toString(),
      paymentTerms: row.paymentTerms,
      vatTreatment: row.vatTreatment,
      vatRate: row.vatRate.toString(),
      changeSummary: null,
      totals,
      scopeItems: row.scopeItems.map((i) => ({
        itemKey: i.itemKey,
        catalogueItemId: i.catalogueItemId,
        name: i.name,
        description: i.description,
        inScope: i.inScope,
        estimateDays: i.estimateDays.toString(),
        price: i.price.toString(),
      })),
      addons: row.addons.map((a) => ({
        kind: a.kind,
        description: a.description,
        quantity: a.quantity.toString(),
        unitPrice: a.unitPrice.toString(),
      })),
      milestones: row.milestones.map((m) => ({
        kind: m.kind,
        name: m.name,
        targetDate: m.targetDate.toISOString().slice(0, 10),
      })),
    };
  }

  /** A Director records approval of an over-threshold discount on the draft; editing the draft clears it. */
  async approveDiscount(
    leadId: string,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<TorVersionDto> {
    if (!user.permissions.includes('tors:approve')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only a Director can approve a discount.',
      });
    }
    const { tor } = await this.requireTor(leadId, user);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      const latest = await this.tors.latestVersion(tor.id, tx);
      if (!latest) throw new NotFoundException(VERSION_NOT_FOUND);
      if (latest.status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
      const changed = await this.tors.approveDiscount(tx, latest.id, user.id, new Date());
      if (changed.count !== 1) throw new ConflictException(NOT_DRAFT);
      await this.audit.record(tx, {
        action: 'tor.discount_approved',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        newValues: {
          versionNo: latest.versionNo,
          discountAmount: latest.discountAmount.toString(),
          oneOffSubtotal: latest.oneOffSubtotal.toString(),
        },
        requestId,
      });
      return latest.id;
    });
    const row = await this.tors.versionRow(id);
    if (!row) throw new NotFoundException(VERSION_NOT_FOUND);
    return this.dto(row);
  }

  /**
   * Freezes the draft: records the content hash and sends it for signature. Refused while an over-threshold
   * discount has no Director approval, and when there is nothing in scope to agree. Editing is no longer
   * possible afterwards (application check here, trigger in the database).
   */
  async send(leadId: string, user: AuthenticatedUser, requestId?: string): Promise<TorVersionDto> {
    const { tor, lead } = await this.requireTor(leadId, user);
    const threshold = await this.settings.discountThresholdPercent();
    const id = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      const latest = await this.tors.latestVersion(tor.id, tx);
      if (!latest) throw new NotFoundException(VERSION_NOT_FOUND);
      if (latest.status === 'SIGNED') throw new ConflictException(SIGNED_LOCKED);
      if (latest.status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
      if (!latest.scopeItems.some((i) => i.inScope)) {
        throw new ConflictException({
          code: 'TOR_NOTHING_IN_SCOPE',
          message: 'Add at least one in-scope item before sending the Terms of Reference.',
        });
      }
      if (latest.discountApprovedAt === null && this.exceedsThreshold(latest, threshold)) {
        throw new ConflictException({
          code: 'TOR_DISCOUNT_APPROVAL_REQUIRED',
          message: `The discount is above ${threshold}%. A Director must approve it before this can be sent.`,
        });
      }
      const hash = contentHashOf(hashableOf(tor.number, latest));
      const sent = await this.tors.markSent(tx, latest.id, {
        actorUserId: user.id,
        at: new Date(),
        hash,
      });
      if (sent.count !== 1) throw new ConflictException(NOT_DRAFT);
      if (lead.stage === LeadStage.ScopeAlignment) {
        const moved = await this.leads.compareAndSetStage(tx, {
          id: leadId,
          fromStage: LeadStage.ScopeAlignment,
          data: { stage: LeadStage.TorQuoteSent },
        });
        if (moved.count === 1) {
          await this.leads.createHistory(tx, {
            leadId,
            fromStage: LeadStage.ScopeAlignment,
            toStage: LeadStage.TorQuoteSent,
            actorUserId: user.id,
            reason: `${tor.number} v${latest.versionNo} sent for signature`,
            source: LeadTransitionSource.TorSent,
          });
        }
      }
      await this.audit.record(tx, {
        action: 'tor.sent',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        newValues: {
          versionNo: latest.versionNo,
          fingerprint: hash,
          totalOneOff: latest.totalOneOff.toString(),
          discountApproved: latest.discountApprovedAt !== null,
        },
        requestId,
      });
      return latest.id;
    });
    const row = await this.tors.versionRow(id);
    if (!row) throw new NotFoundException(VERSION_NOT_FOUND);
    return this.dto(row);
  }
}
