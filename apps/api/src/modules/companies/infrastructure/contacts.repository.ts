import { Injectable } from '@nestjs/common';
import type { ContactDto, Paginated } from '@autonova/contracts';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { normalizePhone } from '../../../common/match-keys.js';
import { normalizeEmail, textOrNull } from '../domain/contact-rules.js';
import type { CreateContactBody, UpdateContactBody } from '../presentation/companies.schemas.js';

type Db = Prisma.TransactionClient;

const contactSelect = {
  id: true,
  companyId: true,
  name: true,
  jobTitle: true,
  phone: true,
  email: true,
  whatsappNumber: true,
  isDecisionMaker: true,
  role: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;

export const toContactDto = (row: ContactRow): ContactDto => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  jobTitle: row.jobTitle,
  phone: row.phone,
  email: row.email,
  whatsappNumber: row.whatsappNumber,
  isDecisionMaker: row.isDecisionMaker,
  role: row.role,
  archived: row.archivedAt !== null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForCompany(
    companyId: string,
    includeArchived: boolean,
    page: number,
    pageSize: number,
  ): Promise<Paginated<ContactDto>> {
    const where: Prisma.ContactWhereInput = {
      companyId,
      ...(includeArchived ? {} : { archivedAt: null }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: contactSelect,
        orderBy: [{ isDecisionMaker: 'desc' }, { role: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items: rows.map(toContactDto), total, page, pageSize };
  }

  /** A contact whose company the caller may see. Both ids must match: no guessing across companies. */
  findVisible(id: string, companyVisible: Prisma.CompanyWhereInput, db: Db = this.prisma) {
    return db.contact.findFirst({
      where: { id, company: companyVisible },
      select: contactSelect,
    });
  }

  create(db: Db, companyId: string, input: CreateContactBody, actorUserId: string) {
    return db.contact.create({
      data: {
        companyId,
        name: input.name,
        jobTitle: textOrNull(input.jobTitle),
        phone: textOrNull(input.phone),
        phoneNormalized: normalizePhone(input.phone),
        email: normalizeEmail(input.email),
        whatsappNumber: textOrNull(input.whatsappNumber),
        isDecisionMaker: input.isDecisionMaker,
        role: input.role ?? null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      select: contactSelect,
    });
  }

  update(db: Db, id: string, input: UpdateContactBody, actorUserId: string) {
    return db.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: textOrNull(input.jobTitle) } : {}),
        ...(input.phone !== undefined
          ? { phone: textOrNull(input.phone), phoneNormalized: normalizePhone(input.phone) }
          : {}),
        ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
        ...(input.whatsappNumber !== undefined
          ? { whatsappNumber: textOrNull(input.whatsappNumber) }
          : {}),
        ...(input.isDecisionMaker !== undefined ? { isDecisionMaker: input.isDecisionMaker } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        updatedByUserId: actorUserId,
      },
      select: contactSelect,
    });
  }

  archive(db: Db, id: string, actorUserId: string, at: Date) {
    return db.contact.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: at, updatedByUserId: actorUserId },
    });
  }

  restore(db: Db, id: string, actorUserId: string) {
    return db.contact.updateMany({
      where: { id, archivedAt: { not: null } },
      data: { archivedAt: null, updatedByUserId: actorUserId },
    });
  }

  /** Whether any lead still points at this contact (as primary or additional). */
  async leadUseCount(db: Db, contactId: string): Promise<number> {
    const [primary, additional] = await Promise.all([
      db.lead.count({ where: { primaryContactId: contactId } }),
      db.leadContact.count({ where: { contactId } }),
    ]);
    return primary + additional;
  }

  /** Contacts of `companyId` among `ids`, with whether each is active; used to validate lead links. */
  contactsOfCompany(companyId: string, ids: string[], db: Db = this.prisma) {
    return db.contact.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, archivedAt: true },
    });
  }
}
