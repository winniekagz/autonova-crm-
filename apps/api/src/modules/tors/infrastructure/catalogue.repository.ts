import { Injectable } from '@nestjs/common';
import type { CatalogueItemDto } from '@autonova/contracts';
import type { Currency, ProductInterest } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { formatMoney, parseMoney } from '../domain/money.js';

const dto = (row: Prisma.CatalogueItemGetPayload<object>): CatalogueItemDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  productInterest: row.productInterest as ProductInterest | null,
  defaultDays: row.defaultDays.toString(),
  defaultPrice: formatMoney(parseMoney(row.defaultPrice.toString()) ?? 0n),
  currency: row.currency as Currency,
  active: row.active,
});

@Injectable()
export class CatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, pageSize: number, activeOnly: boolean) {
    const where: Prisma.CatalogueItemWhereInput = activeOnly ? { active: true } : {};
    const [rows, total] = await Promise.all([
      this.prisma.catalogueItem.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.catalogueItem.count({ where }),
    ]);
    return { items: rows.map(dto), total, page, pageSize };
  }

  async activeByIds(ids: string[], db: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (ids.length === 0) return new Map<string, Prisma.CatalogueItemGetPayload<object>>();
    const rows = await db.catalogueItem.findMany({ where: { id: { in: ids }, active: true } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async create(
    db: Prisma.TransactionClient,
    input: {
      name: string;
      description: string | null;
      productInterest: ProductInterest | null;
      defaultDays: string;
      defaultPrice: string;
      currency: string;
      active: boolean;
      createdByUserId: string;
    },
  ) {
    return dto(await db.catalogueItem.create({ data: input }));
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    input: Omit<Parameters<CatalogueRepository['create']>[1], 'createdByUserId'>,
  ) {
    const found = await db.catalogueItem.findUnique({ where: { id }, select: { id: true } });
    if (!found) return null;
    return dto(await db.catalogueItem.update({ where: { id }, data: input }));
  }
}
