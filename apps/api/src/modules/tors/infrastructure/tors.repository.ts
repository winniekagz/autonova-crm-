import { Injectable } from '@nestjs/common';
import type { TorSignatureDto, TorVersionDto, TorVersionSummaryDto } from '@autonova/contracts';
import type {
  BillingCycle,
  Currency,
  DiscountType,
  MilestoneKind,
  SignatureMethod,
  SignatureParty,
  TorAddonKind,
  TorVersionStatus,
  VatTreatment,
} from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  formatHundredths,
  formatMoney,
  lineTotal,
  parseHundredths,
  parseMoney,
} from '../domain/money.js';
import type { TorTotals } from '../domain/tor-calculator.js';

type Db = Prisma.TransactionClient;

const versionInclude = {
  scopeItems: { orderBy: { position: 'asc' } },
  addons: { orderBy: { position: 'asc' } },
  milestones: { orderBy: [{ targetDate: 'asc' }, { position: 'asc' }] },
  signatures: {
    orderBy: { signedAt: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  },
  createdBy: { select: { fullName: true } },
  discountApprover: { select: { fullName: true } },
} as const satisfies Prisma.TorVersionInclude;

export type VersionRow = Prisma.TorVersionGetPayload<{ include: typeof versionInclude }>;

const day = (date: Date) => date.toISOString().slice(0, 10);
/** Two-decimal text for quantities, days and rates: a Prisma Decimal prints "16", the API always says "16.00". */
const text = (value: { toString(): string }) => {
  const hundredths = parseHundredths(value.toString());
  return hundredths === null ? value.toString() : formatHundredths(hundredths);
};
const money = (value: { toString(): string }) => {
  const cents = parseMoney(value.toString());
  return cents === null ? value.toString() : formatMoney(cents);
};

export const totalsOf = (row: VersionRow): TorTotals => ({
  scopeTotal: money(row.scopeTotal),
  addonsTotal: money(row.addonsTotal),
  oneOffSubtotal: money(row.oneOffSubtotal),
  discountAmount: money(row.discountAmount),
  netOneOff: money(row.netOneOff),
  vatOneOff: money(row.vatOneOff),
  totalOneOff: money(row.totalOneOff),
  recurringVat: money(row.recurringVat),
  recurringTotal: money(row.recurringTotal),
});

const toSignature = (row: VersionRow['signatures'][number]): TorSignatureDto => ({
  id: row.id,
  party: row.party as SignatureParty,
  signerName: row.signerName,
  signerTitle: row.signerTitle,
  method: row.method as SignatureMethod,
  evidenceNote: row.evidenceNote,
  signedAt: row.signedAt.toISOString(),
  recordedByName: row.recordedBy.fullName,
});

/** `needsApproval` is decided by the caller (it depends on a setting), then recorded on the DTO. */
export function toVersionDto(row: VersionRow, needsApproval: boolean): TorVersionDto {
  return {
    id: row.id,
    torId: row.torId,
    versionNo: row.versionNo,
    status: row.status as TorVersionStatus,
    currency: row.currency as Currency,
    setupFee: money(row.setupFee),
    discountType: row.discountType as DiscountType,
    discountValue: money(row.discountValue),
    hostingName: row.hostingName,
    hostingDescription: row.hostingDescription,
    hostingCycle: row.hostingCycle as BillingCycle | null,
    hostingAmount: money(row.hostingAmount),
    paymentTerms: row.paymentTerms,
    vatTreatment: row.vatTreatment as VatTreatment,
    vatRate: text(row.vatRate),
    changeSummary: row.changeSummary,
    totals: totalsOf(row),
    scopeItems: row.scopeItems.map((item) => ({
      id: item.id,
      itemKey: item.itemKey,
      catalogueItemId: item.catalogueItemId,
      position: item.position,
      name: item.name,
      description: item.description,
      inScope: item.inScope,
      estimateDays: text(item.estimateDays),
      price: money(item.price),
    })),
    addons: row.addons.map((addon) => {
      const quantity = parseHundredths(addon.quantity.toString()) ?? 0n;
      const unit = parseMoney(addon.unitPrice.toString()) ?? 0n;
      return {
        id: addon.id,
        kind: addon.kind as TorAddonKind,
        description: addon.description,
        quantity: text(addon.quantity),
        unitPrice: money(addon.unitPrice),
        lineTotal: formatMoney(lineTotal(quantity, unit)),
      };
    }),
    milestones: row.milestones.map((m) => ({
      id: m.id,
      kind: m.kind as MilestoneKind,
      name: m.name,
      targetDate: day(m.targetDate),
    })),
    signatures: row.signatures.map(toSignature),
    discountNeedsApproval: needsApproval,
    discountApprovedByName: row.discountApprover?.fullName ?? null,
    discountApprovedAt: row.discountApprovedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    signedAt: row.signedAt?.toISOString() ?? null,
    contentHash: row.contentHash,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
  };
}

export const toSummary = (row: {
  id: string;
  versionNo: number;
  status: string;
  changeSummary: string | null;
  totalOneOff: { toString(): string };
  currency: string;
  sentAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
}): TorVersionSummaryDto => ({
  id: row.id,
  versionNo: row.versionNo,
  status: row.status as TorVersionStatus,
  changeSummary: row.changeSummary,
  totalOneOff: money(row.totalOneOff),
  currency: row.currency as Currency,
  sentAt: row.sentAt?.toISOString() ?? null,
  signedAt: row.signedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export interface VersionWrite {
  currency: string;
  setupFee: string;
  discountType: DiscountType;
  discountValue: string;
  hostingName: string | null;
  hostingDescription: string | null;
  hostingCycle: BillingCycle | null;
  hostingAmount: string;
  paymentTerms: string | null;
  vatTreatment: VatTreatment;
  vatRate: string;
  changeSummary: string | null;
  totals: TorTotals;
  scopeItems: {
    itemKey: string;
    catalogueItemId: string | null;
    name: string;
    description: string | null;
    inScope: boolean;
    estimateDays: string;
    price: string;
  }[];
  addons: { kind: TorAddonKind; description: string; quantity: string; unitPrice: string }[];
  milestones: { kind: MilestoneKind; name: string; targetDate: string }[];
}

const scalarData = (v: VersionWrite) => ({
  currency: v.currency,
  setupFee: v.setupFee,
  discountType: v.discountType,
  discountValue: v.discountValue,
  hostingName: v.hostingName,
  hostingDescription: v.hostingDescription,
  hostingCycle: v.hostingCycle,
  hostingAmount: v.hostingAmount,
  paymentTerms: v.paymentTerms,
  vatTreatment: v.vatTreatment,
  vatRate: v.vatRate,
  changeSummary: v.changeSummary,
  scopeTotal: v.totals.scopeTotal,
  addonsTotal: v.totals.addonsTotal,
  oneOffSubtotal: v.totals.oneOffSubtotal,
  discountAmount: v.totals.discountAmount,
  netOneOff: v.totals.netOneOff,
  vatOneOff: v.totals.vatOneOff,
  totalOneOff: v.totals.totalOneOff,
  recurringVat: v.totals.recurringVat,
  recurringTotal: v.totals.recurringTotal,
});

@Injectable()
export class TorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByLead(leadId: string, db: Db | PrismaService = this.prisma) {
    return db.tor.findUnique({ where: { leadId } });
  }

  /** Locks the ToR row so concurrent send, sign and new-version calls on one ToR run one at a time. */
  async lock(db: Db, torId: string): Promise<void> {
    await db.$executeRaw`SELECT 1 FROM "tors" WHERE "id" = ${torId}::uuid FOR UPDATE`;
  }

  createTor(db: Db, input: { number: string; leadId: string; actorUserId: string }) {
    return db.tor.create({
      data: { number: input.number, leadId: input.leadId, createdByUserId: input.actorUserId },
    });
  }

  versionRow(id: string, db: Db | PrismaService = this.prisma) {
    return db.torVersion.findUnique({ where: { id }, include: versionInclude });
  }

  versionByNo(torId: string, versionNo: number, db: Db | PrismaService = this.prisma) {
    return db.torVersion.findUnique({
      where: { torId_versionNo: { torId, versionNo } },
      include: versionInclude,
    });
  }

  latestVersion(torId: string, db: Db | PrismaService = this.prisma) {
    return db.torVersion.findFirst({
      where: { torId },
      orderBy: { versionNo: 'desc' },
      include: versionInclude,
    });
  }

  async summaries(torId: string): Promise<TorVersionSummaryDto[]> {
    const rows = await this.prisma.torVersion.findMany({
      where: { torId },
      orderBy: { versionNo: 'desc' },
      take: 100,
    });
    return rows.map(toSummary);
  }

  async createVersion(
    db: Db,
    input: { torId: string; versionNo: number; actorUserId: string; write: VersionWrite },
  ) {
    const created = await db.torVersion.create({
      data: {
        torId: input.torId,
        versionNo: input.versionNo,
        createdByUserId: input.actorUserId,
        ...scalarData(input.write),
      },
    });
    await this.replaceChildren(db, created.id, input.write);
    return created;
  }

  /** Rewrites a DRAFT version. The database refuses this for any other status. */
  async updateDraft(db: Db, id: string, write: VersionWrite) {
    await db.torVersion.update({
      where: { id },
      data: {
        ...scalarData(write),
        discountApprovedByUserId: null,
        discountApprovedAt: null,
      },
    });
    await db.torScopeItem.deleteMany({ where: { torVersionId: id } });
    await db.torAddon.deleteMany({ where: { torVersionId: id } });
    await db.torMilestone.deleteMany({ where: { torVersionId: id } });
    await this.replaceChildren(db, id, write);
  }

  private async replaceChildren(db: Db, versionId: string, write: VersionWrite) {
    if (write.scopeItems.length > 0) {
      await db.torScopeItem.createMany({
        data: write.scopeItems.map((item, position) => ({
          torVersionId: versionId,
          position,
          ...item,
        })),
      });
    }
    if (write.addons.length > 0) {
      await db.torAddon.createMany({
        data: write.addons.map((addon, position) => ({
          torVersionId: versionId,
          position,
          ...addon,
        })),
      });
    }
    if (write.milestones.length > 0) {
      await db.torMilestone.createMany({
        data: write.milestones.map((m, position) => ({
          torVersionId: versionId,
          position,
          kind: m.kind,
          name: m.name,
          targetDate: new Date(`${m.targetDate}T00:00:00.000Z`),
        })),
      });
    }
  }

  approveDiscount(db: Db, id: string, actorUserId: string, at: Date) {
    return db.torVersion.updateMany({
      where: { id, status: 'DRAFT' },
      data: { discountApprovedByUserId: actorUserId, discountApprovedAt: at },
    });
  }

  markSent(db: Db, id: string, input: { actorUserId: string; at: Date; hash: string }) {
    return db.torVersion.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'SENT',
        sentAt: input.at,
        sentByUserId: input.actorUserId,
        contentHash: input.hash,
      },
    });
  }

  supersede(db: Db, id: string) {
    return db.torVersion.updateMany({
      where: { id, status: 'SENT' },
      data: { status: 'SUPERSEDED' },
    });
  }

  markSigned(db: Db, id: string, at: Date) {
    return db.torVersion.updateMany({
      where: { id, status: 'SENT' },
      data: { status: 'SIGNED', signedAt: at },
    });
  }

  addSignature(
    db: Db,
    input: {
      torVersionId: string;
      party: SignatureParty;
      signerName: string;
      signerTitle: string | null;
      evidenceNote: string | null;
      contentHash: string;
      recordedByUserId: string;
    },
  ) {
    return db.torSignature.create({ data: input });
  }

  signedParties(db: Db, torVersionId: string) {
    return db.torSignature.findMany({ where: { torVersionId }, select: { party: true } });
  }
}
