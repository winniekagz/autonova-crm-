import { Injectable } from '@nestjs/common';
import type { Paginated, QuotationDto } from '@autonova/contracts';
import type {
  BillingCycle,
  Currency,
  DiscountType,
  QuotationKind,
  QuotationLineKind,
  QuotationStatus,
  VatTreatment,
} from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { formatMoney, parseMoney } from '../../tors/domain/money.js';
import { isPastValidity } from '../domain/quotation-rules.js';

type Db = Prisma.TransactionClient;

const include = {
  lines: { orderBy: { position: 'asc' } },
  createdBy: { select: { fullName: true } },
  torVersion: { select: { versionNo: true } },
} as const satisfies Prisma.QuotationInclude;

export type QuotationRow = Prisma.QuotationGetPayload<{ include: typeof include }>;

const money = (value: { toString(): string }) => formatMoney(parseMoney(value.toString()) ?? 0n);
const two = (value: { toString(): string }) => {
  const [whole = '0', fraction = ''] = value.toString().split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
};
const day = (date: Date) => date.toISOString().slice(0, 10);

/** `today` decides the derived `expired` flag, so the DTO never claims an old open quote is still valid. */
export function toQuotationDto(row: QuotationRow, today: string): QuotationDto {
  const validUntil = day(row.validUntil);
  return {
    id: row.id,
    number: row.number,
    leadId: row.leadId,
    kind: row.kind as QuotationKind,
    torVersionId: row.torVersionId,
    torVersionNo: row.torVersion?.versionNo ?? null,
    status: row.status as QuotationStatus,
    currency: row.currency as Currency,
    validUntil,
    expired: row.status === 'SENT' && isPastValidity(validUntil, today),
    vatTreatment: row.vatTreatment as VatTreatment,
    vatRate: two(row.vatRate),
    discountType: row.discountType as DiscountType,
    discountValue: money(row.discountValue),
    hostingName: row.hostingName,
    hostingCycle: row.hostingCycle as BillingCycle | null,
    hostingAmount: money(row.hostingAmount),
    totals: {
      oneOffSubtotal: money(row.oneOffSubtotal),
      discountAmount: money(row.discountAmount),
      netOneOff: money(row.netOneOff),
      vatOneOff: money(row.vatOneOff),
      totalOneOff: money(row.totalOneOff),
      recurringVat: money(row.recurringVat),
      recurringTotal: money(row.recurringTotal),
    },
    lines: row.lines.map((l) => ({
      id: l.id,
      kind: l.kind as QuotationLineKind,
      description: l.description,
      quantity: two(l.quantity),
      unitPrice: money(l.unitPrice),
      lineTotal: money(l.lineTotal),
    })),
    notes: row.notes,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface QuotationWrite {
  number: string;
  leadId: string;
  kind: QuotationKind;
  torVersionId: string | null;
  currency: string;
  validUntil: string;
  vatTreatment: VatTreatment;
  vatRate: string;
  discountType: DiscountType;
  discountValue: string;
  hostingName: string | null;
  hostingCycle: BillingCycle | null;
  hostingAmount: string;
  oneOffSubtotal: string;
  discountAmount: string;
  netOneOff: string;
  vatOneOff: string;
  totalOneOff: string;
  recurringVat: string;
  recurringTotal: string;
  notes: string | null;
  createdByUserId: string;
  lines: {
    kind: QuotationLineKind;
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
}

@Injectable()
export class QuotationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  row(id: string, db: Db | PrismaService = this.prisma) {
    return db.quotation.findUnique({ where: { id }, include });
  }

  async create(db: Db, input: QuotationWrite) {
    const { lines, validUntil, ...scalars } = input;
    const created = await db.quotation.create({
      data: { ...scalars, validUntil: new Date(`${validUntil}T00:00:00.000Z`) },
    });
    await db.quotationLine.createMany({
      data: lines.map((line, position) => ({ quotationId: created.id, position, ...line })),
    });
    return created.id;
  }

  async listForLead(leadId: string, page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { leadId },
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where: { leadId } }),
    ]);
    return { rows, total };
  }

  /** Compare-and-set on the current status, so two people moving one quote cannot both succeed. */
  move(db: Db, id: string, from: QuotationStatus, to: QuotationStatus, at: Date) {
    return db.quotation.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        ...(to === 'SENT' ? { sentAt: at } : {}),
        ...(to === 'ACCEPTED' || to === 'REJECTED' ? { decidedAt: at } : {}),
      },
    });
  }

  /** Open quotes whose validity date has passed. Bounded: callers expire them in batches. */
  expiredOpen(today: string, take: number) {
    return this.prisma.quotation.findMany({
      where: { status: 'SENT', validUntil: { lt: new Date(`${today}T00:00:00.000Z`) } },
      select: { id: true, leadId: true },
      orderBy: { validUntil: 'asc' },
      take,
    });
  }

  async openCount(): Promise<Paginated<never>['total']> {
    return this.prisma.quotation.count({ where: { status: 'SENT' } });
  }
}
