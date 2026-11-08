import { Injectable } from '@nestjs/common';
import type {
  CompanyDto,
  CompanyDuplicateCandidateDto,
  CompanyLeadDto,
  Paginated,
} from '@autonova/contracts';
import type { CompanyIndustry, LeadStage } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { normalizeCompanyName } from '../../../common/match-keys.js';
import { companyMatches, type CompanyKeys } from '../domain/company-rules.js';
import type {
  CompanyFields,
  CompanyUpdateFields,
  ListCompaniesQuery,
} from '../presentation/companies.schemas.js';
import { textOrNull } from '../domain/contact-rules.js';

type Db = Prisma.TransactionClient;

const companySelect = {
  id: true,
  name: true,
  nameNormalized: true,
  kraPin: true,
  location: true,
  industry: true,
  staffCount: true,
  branchCount: true,
  website: true,
  socialLinks: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { fullName: true } },
} as const;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

export function toCompanyDto(
  row: CompanyRow,
  counts: { contacts: number; leads: number },
): CompanyDto {
  return {
    id: row.id,
    name: row.name,
    kraPin: row.kraPin,
    location: row.location,
    industry: row.industry as CompanyIndustry | null,
    staffCount: row.staffCount,
    branchCount: row.branchCount,
    website: row.website,
    socialLinks: row.socialLinks,
    archived: row.archivedAt !== null,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contactCount: counts.contacts,
    leadCount: counts.leads,
  };
}

/** Persistence only: which rows a caller may see is decided by the caller and passed in as `visible`. */
@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async countsFor(ids: string[], leadScope: Prisma.LeadWhereInput) {
    if (ids.length === 0)
      return { contacts: new Map<string, number>(), leads: new Map<string, number>() };
    const [contacts, leads] = await Promise.all([
      this.prisma.contact.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids }, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids }, ...leadScope },
        _count: { _all: true },
      }),
    ]);
    return {
      contacts: new Map(contacts.map((row) => [row.companyId, row._count._all])),
      leads: new Map(
        leads.flatMap((row) => (row.companyId ? [[row.companyId, row._count._all] as const] : [])),
      ),
    };
  }

  async list(
    query: ListCompaniesQuery,
    visible: Prisma.CompanyWhereInput,
    leadScope: Prisma.LeadWhereInput,
  ): Promise<Paginated<CompanyDto>> {
    const nameKey = query.q ? normalizeCompanyName(query.q) : null;
    const where: Prisma.CompanyWhereInput = {
      AND: [
        visible,
        query.includeArchived === 'true' ? {} : { archivedAt: null },
        query.industry ? { industry: query.industry } : {},
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                ...(nameKey ? [{ nameNormalized: { contains: nameKey } }] : []),
                { kraPin: { equals: query.q.replace(/\s+/g, '').toUpperCase() } },
                { location: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        select: companySelect,
        orderBy: [{ nameNormalized: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);
    const counts = await this.countsFor(
      rows.map((row) => row.id),
      leadScope,
    );
    return {
      items: rows.map((row) =>
        toCompanyDto(row, {
          contacts: counts.contacts.get(row.id) ?? 0,
          leads: counts.leads.get(row.id) ?? 0,
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, visible: Prisma.CompanyWhereInput, leadScope: Prisma.LeadWhereInput) {
    const row = await this.prisma.company.findFirst({
      where: { AND: [{ id }, visible] },
      select: companySelect,
    });
    if (!row) return null;
    const counts = await this.countsFor([id], leadScope);
    return toCompanyDto(row, {
      contacts: counts.contacts.get(id) ?? 0,
      leads: counts.leads.get(id) ?? 0,
    });
  }

  /** The raw row for a visible company, or null: used before every nested read or write. */
  findVisible(id: string, visible: Prisma.CompanyWhereInput, db: Db = this.prisma) {
    return db.company.findFirst({ where: { AND: [{ id }, visible] } });
  }

  async leads(
    companyId: string,
    leadScope: Prisma.LeadWhereInput,
    page: number,
    pageSize: number,
  ): Promise<Paginated<CompanyLeadDto>> {
    const where: Prisma.LeadWhereInput = { companyId, ...leadScope };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: {
          id: true,
          name: true,
          stage: true,
          estimatedValue: true,
          currency: true,
          nextActionAt: true,
          owner: { select: { fullName: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        stage: row.stage as LeadStage,
        ownerName: row.owner.fullName,
        estimatedValue: row.estimatedValue?.toFixed(2) ?? null,
        currency: row.currency as 'KES' | 'USD',
        nextActionAt: row.nextActionAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Companies sharing a KRA PIN or a normalised name, across ALL companies (not only visible ones),
   * so a restricted user cannot create a second record for an organisation they cannot see.
   * Archived companies are included so they can be restored instead of duplicated.
   */
  findDuplicates(keys: CompanyKeys, excludeId: string | undefined, take = 25) {
    const matches: Prisma.CompanyWhereInput[] = [];
    if (keys.kraPin) matches.push({ kraPin: keys.kraPin });
    if (keys.name) matches.push({ nameNormalized: keys.name });
    if (matches.length === 0) return Promise.resolve([]);
    return this.prisma.company.findMany({
      where: { OR: matches, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: {
        id: true,
        name: true,
        nameNormalized: true,
        kraPin: true,
        location: true,
        archivedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  /** Which of these ids the caller may see; used to describe duplicates only to people allowed to see them. */
  async visibleIds(ids: string[], visible: Prisma.CompanyWhereInput): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.company.findMany({
      where: { AND: [{ id: { in: ids } }, visible] },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  candidateOf(
    row: {
      id: string;
      name: string;
      nameNormalized: string;
      kraPin: string | null;
      location: string | null;
      archivedAt: Date | null;
    },
    keys: CompanyKeys,
  ): CompanyDuplicateCandidateDto {
    return {
      id: row.id,
      name: row.name,
      kraPin: row.kraPin,
      location: row.location,
      archived: row.archivedAt !== null,
      matchedOn: companyMatches(row, keys),
    };
  }

  create(
    db: Db,
    input: CompanyFields,
    keys: { name: string; kraPin: string | null; links: string[] },
    actorUserId: string,
  ) {
    return db.company.create({
      data: {
        name: input.name,
        nameNormalized: keys.name,
        kraPin: keys.kraPin,
        location: textOrNull(input.location),
        industry: input.industry ?? null,
        staffCount: input.staffCount ?? null,
        branchCount: input.branchCount ?? null,
        website: textOrNull(input.website),
        socialLinks: keys.links,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      select: { id: true },
    });
  }

  update(
    db: Db,
    id: string,
    input: CompanyUpdateFields,
    keys: {
      name: string | undefined;
      kraPin: string | null | undefined;
      links: string[] | undefined;
    },
    actorUserId: string,
  ) {
    return db.company.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name, nameNormalized: keys.name } : {}),
        ...(keys.kraPin !== undefined ? { kraPin: keys.kraPin } : {}),
        ...(input.location !== undefined ? { location: textOrNull(input.location) } : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        ...(input.staffCount !== undefined ? { staffCount: input.staffCount } : {}),
        ...(input.branchCount !== undefined ? { branchCount: input.branchCount } : {}),
        ...(input.website !== undefined ? { website: textOrNull(input.website) } : {}),
        ...(keys.links !== undefined ? { socialLinks: keys.links } : {}),
        updatedByUserId: actorUserId,
      },
      select: { id: true },
    });
  }

  /** Compare-and-set so two people archiving at once archive once. */
  archive(db: Db, id: string, actorUserId: string, at: Date) {
    return db.company.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: at, archivedByUserId: actorUserId, updatedByUserId: actorUserId },
    });
  }

  unarchive(db: Db, id: string, actorUserId: string) {
    return db.company.updateMany({
      where: { id, archivedAt: { not: null } },
      data: { archivedAt: null, archivedByUserId: null, updatedByUserId: actorUserId },
    });
  }

  countOpenLeads(db: Db, companyId: string) {
    return db.lead.count({
      where: { companyId, stage: { notIn: ['WON', 'LOST', 'DISQUALIFIED'] } },
    });
  }
}
