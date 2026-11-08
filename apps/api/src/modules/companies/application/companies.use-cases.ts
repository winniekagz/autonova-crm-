import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CompanyDto, CompanyLeadDto, Paginated } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { normalizeCompanyName } from '../../../common/match-keys.js';
import { normalizeKraPin, normalizeLinks } from '../domain/company-rules.js';
import { CompaniesRepository } from '../infrastructure/companies.repository.js';
import type {
  ArchiveBody,
  CompanyLeadsQuery,
  CreateCompanyBody,
  ListCompaniesQuery,
  UpdateCompanyBody,
} from '../presentation/companies.schemas.js';
import { CompanyDuplicatesService } from './company-duplicates.service.js';
import { companyVisibility, leadOwnerScope } from './company-scope.js';

export const COMPANY_NOT_FOUND = { code: 'COMPANY_NOT_FOUND', message: 'Company not found' };
export const COMPANY_HAS_OPEN_LEADS = {
  code: 'COMPANY_HAS_OPEN_LEADS',
  message: 'This company still has open leads. Close or disqualify them before archiving it.',
};
export const COMPANY_ARCHIVED = {
  code: 'COMPANY_ARCHIVED',
  message: 'This company is archived. Restore it before changing it.',
};

/** Audit snapshots list explicit fields only (docs/08): never a whole row. */
type AuditValues = Record<string, string | number | null>;
const auditFields = (c: {
  name: string;
  kraPin: string | null;
  location: string | null;
  industry: string | null;
  staffCount: number | null;
  branchCount: number | null;
  website: string | null;
}): AuditValues => ({
  name: c.name,
  kraPin: c.kraPin,
  location: c.location,
  industry: c.industry,
  staffCount: c.staffCount,
  branchCount: c.branchCount,
  website: c.website,
});

@Injectable()
export class CompaniesUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesRepository,
    private readonly duplicates: CompanyDuplicatesService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListCompaniesQuery, user: AuthenticatedUser): Promise<Paginated<CompanyDto>> {
    return this.companies.list(query, companyVisibility(user), leadOwnerScope(user));
  }

  async get(id: string, user: AuthenticatedUser): Promise<CompanyDto> {
    const company = await this.companies.get(id, companyVisibility(user), leadOwnerScope(user));
    if (!company) throw new NotFoundException(COMPANY_NOT_FOUND);
    return company;
  }

  async leads(
    id: string,
    query: CompanyLeadsQuery,
    user: AuthenticatedUser,
  ): Promise<Paginated<CompanyLeadDto>> {
    await this.requireVisible(id, user);
    return this.companies.leads(id, leadOwnerScope(user), query.page, query.pageSize);
  }

  async create(
    input: CreateCompanyBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<CompanyDto> {
    const { acknowledgeDuplicates, ...fields } = input;
    const keys = this.duplicates.keysOf(fields);
    const duplicateAcknowledged = await this.duplicates.assertAllowed(
      keys,
      undefined,
      user,
      acknowledgeDuplicates === true,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.companies.create(
        tx,
        fields,
        {
          name: keys.name ?? fields.name.toLowerCase(),
          kraPin: keys.kraPin,
          links: normalizeLinks(fields.socialLinks),
        },
        user.id,
      );
      await this.audit.record(tx, {
        action: 'company.created',
        entityType: 'company',
        entityId: row.id,
        actorUserId: user.id,
        newValues: {
          ...auditFields({ ...emptyFields, ...fields, kraPin: keys.kraPin }),
          duplicateAcknowledged,
        },
        requestId,
      });
      return row;
    });
    return this.get(created.id, user);
  }

  async update(
    id: string,
    input: UpdateCompanyBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<CompanyDto> {
    const { acknowledgeDuplicates, ...fields } = input;
    const current = await this.requireVisible(id, user);
    if (current.archivedAt) throw new ConflictException(COMPANY_ARCHIVED);

    const nextName =
      fields.name === undefined
        ? undefined
        : (normalizeCompanyName(fields.name) ?? fields.name.toLowerCase());
    const nextPin = fields.kraPin === undefined ? undefined : normalizeKraPin(fields.kraPin);
    const nameChanged = nextName !== undefined && nextName !== current.nameNormalized;
    const pinChanged = nextPin !== undefined && nextPin !== current.kraPin;
    const duplicateAcknowledged = await this.duplicates.assertAllowed(
      { name: nameChanged ? nextName : null, kraPin: pinChanged ? nextPin : null },
      id,
      user,
      acknowledgeDuplicates === true,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.companies.update(
        tx,
        id,
        fields,
        {
          name: nextName,
          kraPin: nextPin,
          links: fields.socialLinks === undefined ? undefined : normalizeLinks(fields.socialLinks),
        },
        user.id,
      );
      await this.audit.record(tx, {
        action: 'company.updated',
        entityType: 'company',
        entityId: id,
        actorUserId: user.id,
        oldValues: pick(auditFields(current), fields),
        newValues: {
          ...pick(
            auditFields({
              ...current,
              ...fields,
              kraPin: nextPin === undefined ? current.kraPin : nextPin,
            }),
            fields,
          ),
          ...(duplicateAcknowledged ? { duplicateAcknowledged } : {}),
        },
        requestId,
      });
    });
    return this.get(id, user);
  }

  async archive(
    id: string,
    input: ArchiveBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<CompanyDto> {
    await this.requireVisible(id, user);
    await this.prisma.$transaction(async (tx) => {
      if ((await this.companies.countOpenLeads(tx, id)) > 0) {
        throw new ConflictException(COMPANY_HAS_OPEN_LEADS);
      }
      const changed = await this.companies.archive(tx, id, user.id, new Date());
      if (changed.count !== 1) throw new ConflictException(COMPANY_ARCHIVED);
      await this.audit.record(tx, {
        action: 'company.archived',
        entityType: 'company',
        entityId: id,
        actorUserId: user.id,
        reason: input.reason,
        requestId,
      });
    });
    return this.get(id, user);
  }

  async restore(id: string, user: AuthenticatedUser, requestId?: string): Promise<CompanyDto> {
    const current = await this.requireVisible(id, user);
    // Restoring re-activates the KRA PIN, so it must still be free.
    await this.duplicates.assertAllowed({ kraPin: current.kraPin, name: null }, id, user, true);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.companies.unarchive(tx, id, user.id);
      if (changed.count !== 1) return;
      await this.audit.record(tx, {
        action: 'company.restored',
        entityType: 'company',
        entityId: id,
        actorUserId: user.id,
        requestId,
      });
    });
    return this.get(id, user);
  }

  /** Loads the company only if the caller may see it; otherwise reports "not found", never "forbidden". */
  async requireVisible(id: string, user: AuthenticatedUser) {
    const company = await this.companies.findVisible(id, companyVisibility(user));
    if (!company) throw new NotFoundException(COMPANY_NOT_FOUND);
    return company;
  }
}

const emptyFields = {
  name: '',
  kraPin: null,
  location: null,
  industry: null,
  staffCount: null,
  branchCount: null,
  website: null,
} as const;

/** The audit entries for an update list only the fields the request touched. */
function pick(values: AuditValues, touched: object): AuditValues {
  const keys = Object.keys(touched);
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)));
}
