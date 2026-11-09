import { Injectable } from '@nestjs/common';
import type { ClientAccountDto, Paginated } from '@autonova/contracts';
import type { BillingCycle, ClientAccountStatus, Currency, MilestoneKind } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { formatMoney, parseMoney } from '../../tors/domain/money.js';

const include = {
  signedVersion: { include: { milestones: { orderBy: { position: 'asc' } } } },
} as const satisfies Prisma.ClientAccountInclude;

type Row = Prisma.ClientAccountGetPayload<{ include: typeof include }>;

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export const toClientAccountDto = (row: Row): ClientAccountDto => ({
  id: row.id,
  number: row.number,
  leadId: row.leadId,
  torId: row.torId,
  signedTorVersionId: row.signedTorVersionId,
  signedTorVersionNo: row.signedVersion.versionNo,
  companyId: row.companyId,
  name: row.name,
  status: row.status as ClientAccountStatus,
  goLiveDate: day(row.goLiveDate),
  planName: row.planName,
  billingCycle: row.billingCycle as BillingCycle | null,
  planAmount: formatMoney(parseMoney(row.planAmount.toString()) ?? 0n),
  currency: row.currency as Currency,
  nextRenewalDate: day(row.nextRenewalDate),
  // Milestones are read from the signed version, so they are exactly what was agreed and cannot drift.
  milestones: row.signedVersion.milestones.map((m) => ({
    id: m.id,
    kind: m.kind as MilestoneKind,
    name: m.name,
    targetDate: m.targetDate.toISOString().slice(0, 10),
  })),
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    ownerUserId: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<Paginated<ClientAccountDto>> {
    const where: Prisma.ClientAccountWhereInput = ownerUserId ? { lead: { ownerUserId } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.clientAccount.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.clientAccount.count({ where }),
    ]);
    return { items: rows.map(toClientAccountDto), total, page, pageSize };
  }

  async byLead(leadId: string, ownerUserId: string | undefined) {
    const row = await this.prisma.clientAccount.findFirst({
      where: { leadId, ...(ownerUserId ? { lead: { ownerUserId } } : {}) },
      include,
    });
    return row ? toClientAccountDto(row) : null;
  }

  async byId(id: string, ownerUserId: string | undefined) {
    const row = await this.prisma.clientAccount.findFirst({
      where: { id, ...(ownerUserId ? { lead: { ownerUserId } } : {}) },
      include,
    });
    return row ? toClientAccountDto(row) : null;
  }
}
