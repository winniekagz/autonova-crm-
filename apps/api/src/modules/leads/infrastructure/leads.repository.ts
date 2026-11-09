import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { LeadContactRef, LeadDto, LeadStageHistoryDto, Paginated } from '@autonova/contracts';
import { LeadDisqualificationReason, LeadStage, ProductInterest } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { normalizePhone, type LeadKeys } from '../domain/lead-duplicates.js';
import { availableLeadLifecycle } from '../domain/lead-lifecycle.js';
import type {
  CreateLeadFields,
  ListLeadsQuery,
  UpdateLeadFields,
} from '../presentation/leads.schemas.js';

type Db = Prisma.TransactionClient;

const contactRef = { select: { id: true, name: true, jobTitle: true, archivedAt: true } } as const;
const includeOwner = {
  owner: { select: { fullName: true } },
  company: { select: { id: true, name: true, archivedAt: true } },
  primaryContact: contactRef,
  contacts: { select: { contact: contactRef }, orderBy: { createdAt: 'asc' } },
} as const;

type ContactRefRow = { id: string; name: string; jobTitle: string | null; archivedAt: Date | null };
const toContactRef = (row: ContactRefRow): LeadContactRef => ({
  id: row.id,
  name: row.name,
  jobTitle: row.jobTitle,
  archived: row.archivedAt !== null,
});

export function toLeadDto(row: {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  referrerName: string | null;
  productInterest: ProductInterest | null;
  legacyProductInterest: string | null;
  notes: string | null;
  estimatedValue: Prisma.Decimal | null;
  currency: string;
  stage: LeadStage;
  lostReason: string | null;
  lostAt: Date | null;
  lostByUserId?: string | null;
  disqualificationReason: string | null;
  disqualifiedByUserId?: string | null;
  revisitOn: Date | null;
  ownerUserId: string;
  owner: { fullName: string };
  company: { id: string; name: string; archivedAt: Date | null } | null;
  primaryContact: ContactRefRow | null;
  contacts: { contact: ContactRefRow }[];
  nextAction: string;
  nextActionAt: Date;
  probability: number | null;
  createdAt: Date;
  updatedAt: Date;
}): LeadDto {
  return {
    id: row.id,
    name: row.name,
    // The company record is the source of truth once linked; the text only survives on unlinked legacy rows.
    companyName: row.company?.name ?? row.companyName,
    company: row.company
      ? { id: row.company.id, name: row.company.name, archived: row.company.archivedAt !== null }
      : null,
    primaryContact: row.primaryContact ? toContactRef(row.primaryContact) : null,
    additionalContacts: row.contacts.map((link) => toContactRef(link.contact)),
    phone: row.phone,
    email: row.email,
    source: row.source as LeadDto['source'],
    referrerName: row.referrerName,
    productInterest: row.productInterest,
    legacyProductInterest: row.legacyProductInterest,
    notes: row.notes,
    estimatedValue: row.estimatedValue?.toFixed(2) ?? null,
    currency: row.currency as LeadDto['currency'],
    stage: row.stage,
    lifecycle: availableLeadLifecycle(row.stage),
    lostReason: row.lostReason,
    lostAt: row.lostAt?.toISOString() ?? null,
    disqualificationReason: row.disqualificationReason as LeadDto['disqualificationReason'],
    revisitOn: row.revisitOn?.toISOString().slice(0, 10) ?? null,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner.fullName,
    nextAction: row.nextAction,
    nextActionAt: row.nextActionAt.toISOString(),
    probability: row.probability,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListLeadsQuery, ownerUserId?: string) {
    const where: Prisma.LeadWhereInput = {
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { companyName: { contains: filter.q, mode: 'insensitive' } },
              { company: { name: { contains: filter.q, mode: 'insensitive' } } },
              { email: { contains: filter.q, mode: 'insensitive' } },
              { phone: { contains: filter.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: includeOwner,
        orderBy: { updatedAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items: rows.map(toLeadDto), total };
  }

  async get(id: string, ownerUserId?: string) {
    const row = await this.prisma.lead.findFirst({
      where: { id, ...(ownerUserId ? { ownerUserId } : {}) },
      include: includeOwner,
    });
    return row ? toLeadDto(row) : null;
  }

  async findForLifecycle(id: string, ownerUserId?: string, db: Db = this.prisma) {
    return db.lead.findFirst({ where: { id, ...(ownerUserId ? { ownerUserId } : {}) } });
  }

  async compareAndSetStage(
    db: Db,
    input: {
      id: string;
      fromStage: LeadStage;
      data: Prisma.LeadUncheckedUpdateManyInput;
      revisitOn?: Date | null;
    },
  ) {
    return db.lead.updateMany({
      where: {
        id: input.id,
        stage: input.fromStage,
        ...(input.revisitOn !== undefined ? { revisitOn: input.revisitOn } : {}),
      },
      data: input.data,
    });
  }

  createHistory(db: Db, input: Prisma.LeadStageHistoryUncheckedCreateInput) {
    return db.leadStageHistory.create({ data: input });
  }

  async history(
    id: string,
    ownerUserId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<Paginated<LeadStageHistoryDto> | null> {
    const scoped = await this.prisma.lead.findFirst({
      where: { id, ...(ownerUserId ? { ownerUserId } : {}) },
      select: { id: true },
    });
    if (!scoped) return null;
    const [rows, total] = await Promise.all([
      this.prisma.leadStageHistory.findMany({
        where: { leadId: id },
        include: {
          actor: { select: { fullName: true } },
          qualification: { select: { score: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.leadStageHistory.count({ where: { leadId: id } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        fromStage: row.fromStage,
        toStage: row.toStage,
        actorUserId: row.actorUserId,
        actorName: row.actor?.fullName ?? null,
        occurredAt: row.occurredAt.toISOString(),
        reason: row.reason,
        disqualificationReason: row.disqualificationReason,
        revisitOn: row.revisitOn?.toISOString().slice(0, 10) ?? null,
        source: row.source,
        qualificationScore: row.qualification?.score ?? null,
        qualificationOverride: row.qualificationOverride,
      })),
      total,
      page,
      pageSize,
    };
  }

  async dueRevisits(cutoff: Date, take = 100) {
    return this.prisma.lead.findMany({
      where: {
        stage: LeadStage.Disqualified,
        disqualificationReason: LeadDisqualificationReason.TimingRevisitLater,
        revisitOn: { lte: cutoff },
      },
      orderBy: [{ revisitOn: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true, revisitOn: true },
    });
  }

  /** Leads (any owner, any stage) sharing a normalised phone. Callers filter by visibility. */
  async findDuplicateCandidates(keys: LeadKeys, excludeLeadId: string | undefined, take = 50) {
    const matches: Prisma.LeadWhereInput[] = [];
    if (keys.phone) matches.push({ phoneNormalized: keys.phone });
    if (matches.length === 0) return [];
    return this.prisma.lead.findMany({
      where: { OR: matches, ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}) },
      select: {
        id: true,
        name: true,
        companyName: true,
        company: { select: { name: true } },
        phone: true,
        stage: true,
        ownerUserId: true,
        phoneNormalized: true,
        createdAt: true,
        owner: { select: { fullName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  async create(
    input: CreateLeadFields,
    links: {
      companyId: string | null;
      primaryContactId: string | null;
      additionalContactIds: string[];
    },
    actorUserId: string,
    db: Db = this.prisma,
  ) {
    return db.lead.create({
      data: {
        ...input,
        companyId: links.companyId,
        primaryContactId: links.primaryContactId,
        contacts: { create: links.additionalContactIds.map((contactId) => ({ contactId })) },
        phoneNormalized: normalizePhone(input.phone),
        email: input.email || null,
        phone: input.phone || null,
        referrerName: input.referrerName || null,
        productInterest: input.productInterest ?? null,
        notes: input.notes || null,
        estimatedValue: input.estimatedValue ?? null,
        nextActionAt: new Date(input.nextActionAt),
        ownerUserId: actorUserId,
        createdByUserId: actorUserId,
      },
      include: includeOwner,
    });
  }

  async update(
    id: string,
    input: UpdateLeadFields,
    ownerUserId: string | undefined,
    db: Db = this.prisma,
  ) {
    const row = await db.lead.findFirst({ where: { id, ...(ownerUserId ? { ownerUserId } : {}) } });
    if (!row) return null;
    return db.lead.update({
      where: { id },
      data: {
        ...input,
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined
          ? { phone: input.phone || null, phoneNormalized: normalizePhone(input.phone) }
          : {}),
        ...(input.referrerName !== undefined ? { referrerName: input.referrerName || null } : {}),
        ...(input.productInterest !== undefined ? { productInterest: input.productInterest } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}),
        ...(input.nextActionAt !== undefined ? { nextActionAt: new Date(input.nextActionAt) } : {}),
      },
      include: includeOwner,
    });
  }

  /**
   * Replaces a lead's company and contact links. Existing extra contacts are removed first because a
   * database trigger requires every linked contact to belong to the lead's (new) company.
   */
  async setRelationships(
    db: Db,
    leadId: string,
    links: {
      companyId: string | null;
      primaryContactId: string | null;
      additionalContactIds: string[];
    },
  ) {
    await db.leadContact.deleteMany({ where: { leadId } });
    await db.lead.update({
      where: { id: leadId },
      data: { companyId: links.companyId, primaryContactId: links.primaryContactId },
      select: { id: true },
    });
    if (links.additionalContactIds.length > 0) {
      await db.leadContact.createMany({
        data: links.additionalContactIds.map((contactId) => ({ leadId, contactId })),
      });
    }
  }

  linksOf(db: Db, leadId: string) {
    return db.lead.findUnique({
      where: { id: leadId },
      select: {
        companyId: true,
        primaryContactId: true,
        contacts: { select: { contactId: true }, orderBy: { createdAt: 'asc' } },
      },
    });
  }
}
