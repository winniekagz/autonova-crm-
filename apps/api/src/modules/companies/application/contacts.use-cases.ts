import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContactDto, Paginated } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { ContactsRepository, toContactDto } from '../infrastructure/contacts.repository.js';
import type {
  ArchiveBody,
  CreateContactBody,
  ListContactsQuery,
  UpdateContactBody,
} from '../presentation/companies.schemas.js';
import { COMPANY_ARCHIVED, CompaniesUseCases } from './companies.use-cases.js';
import { companyVisibility } from './company-scope.js';

export const CONTACT_NOT_FOUND = { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' };
export const CONTACT_IN_USE = {
  code: 'CONTACT_IN_USE',
  message: 'This contact is linked to a lead. Remove them from the lead before archiving.',
};
export const CONTACT_ARCHIVED = {
  code: 'CONTACT_ARCHIVED',
  message: 'This contact is archived. Restore it before changing it.',
};

type AuditValues = Record<string, string | boolean | null>;
const auditFields = (c: {
  name: string;
  jobTitle: string | null;
  isDecisionMaker: boolean;
  role: string | null;
  phone: string | null;
  email: string | null;
  whatsappNumber: string | null;
}): AuditValues => ({
  name: c.name,
  jobTitle: c.jobTitle,
  isDecisionMaker: c.isDecisionMaker,
  role: c.role,
  // Contact details are personal data (docs/06): the audit trail records that they changed, not the values.
  phoneSet: c.phone !== null,
  emailSet: c.email !== null,
  whatsappSet: c.whatsappNumber !== null,
});

@Injectable()
export class ContactsUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsRepository,
    private readonly companies: CompaniesUseCases,
    private readonly audit: AuditService,
  ) {}

  async list(
    companyId: string,
    query: ListContactsQuery,
    user: AuthenticatedUser,
  ): Promise<Paginated<ContactDto>> {
    await this.companies.requireVisible(companyId, user);
    return this.contacts.listForCompany(
      companyId,
      query.includeArchived === 'true',
      query.page,
      query.pageSize,
    );
  }

  async get(id: string, user: AuthenticatedUser): Promise<ContactDto> {
    const contact = await this.contacts.findVisible(id, companyVisibility(user));
    if (!contact) throw new NotFoundException(CONTACT_NOT_FOUND);
    return toContactDto(contact);
  }

  async create(
    companyId: string,
    input: CreateContactBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ContactDto> {
    const company = await this.companies.requireVisible(companyId, user);
    if (company.archivedAt) throw new ConflictException(COMPANY_ARCHIVED);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.contacts.create(tx, companyId, input, user.id);
      await this.audit.record(tx, {
        action: 'contact.created',
        entityType: 'contact',
        entityId: row.id,
        actorUserId: user.id,
        newValues: { companyId, ...auditFields(row) },
        requestId,
      });
      return row;
    });
    return this.get(created.id, user);
  }

  async update(
    id: string,
    input: UpdateContactBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ContactDto> {
    const current = await this.contacts.findVisible(id, companyVisibility(user));
    if (!current) throw new NotFoundException(CONTACT_NOT_FOUND);
    if (current.archivedAt) throw new ConflictException(CONTACT_ARCHIVED);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.contacts.update(tx, id, input, user.id);
      await this.audit.record(tx, {
        action: 'contact.updated',
        entityType: 'contact',
        entityId: id,
        actorUserId: user.id,
        oldValues: auditFields(current),
        newValues: auditFields(row),
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
  ): Promise<ContactDto> {
    const current = await this.contacts.findVisible(id, companyVisibility(user));
    if (!current) throw new NotFoundException(CONTACT_NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      if ((await this.contacts.leadUseCount(tx, id)) > 0)
        throw new ConflictException(CONTACT_IN_USE);
      const changed = await this.contacts.archive(tx, id, user.id, new Date());
      if (changed.count !== 1) throw new ConflictException(CONTACT_ARCHIVED);
      await this.audit.record(tx, {
        action: 'contact.archived',
        entityType: 'contact',
        entityId: id,
        actorUserId: user.id,
        reason: input.reason,
        requestId,
      });
    });
    return this.get(id, user);
  }

  async restore(id: string, user: AuthenticatedUser, requestId?: string): Promise<ContactDto> {
    const current = await this.contacts.findVisible(id, companyVisibility(user));
    if (!current) throw new NotFoundException(CONTACT_NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.contacts.restore(tx, id, user.id);
      if (changed.count !== 1) return;
      await this.audit.record(tx, {
        action: 'contact.restored',
        entityType: 'contact',
        entityId: id,
        actorUserId: user.id,
        requestId,
      });
    });
    return this.get(id, user);
  }
}
