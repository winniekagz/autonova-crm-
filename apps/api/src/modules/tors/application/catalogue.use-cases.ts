import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogueItemDto, Paginated } from '@autonova/contracts';
import type { ProductInterest } from '@autonova/enums';
import { ProductInterest as ProductInterestValues, enumValues } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CatalogueRepository } from '../infrastructure/catalogue.repository.js';
import type { CatalogueBody } from '../presentation/tors.schemas.js';

const NOT_FOUND = { code: 'CATALOGUE_ITEM_NOT_FOUND', message: 'Catalogue item not found' };

const interestOf = (value: string | null | undefined): ProductInterest | null =>
  enumValues(ProductInterestValues).find((v) => v === value) ?? null;

@Injectable()
export class CatalogueUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueRepository,
    private readonly audit: AuditService,
  ) {}

  list(
    page: number,
    pageSize: number,
    includeInactive: boolean,
  ): Promise<Paginated<CatalogueItemDto>> {
    return this.catalogue.list(page, pageSize, !includeInactive);
  }

  async create(
    input: CatalogueBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<CatalogueItemDto> {
    return this.prisma.$transaction(async (tx) => {
      const created = await this.catalogue.create(tx, {
        name: input.name,
        description: input.description?.trim() || null,
        productInterest: interestOf(input.productInterest),
        defaultDays: input.defaultDays,
        defaultPrice: input.defaultPrice,
        currency: input.currency,
        active: input.active ?? true,
        createdByUserId: user.id,
      });
      await this.audit.record(tx, {
        action: 'catalogue.created',
        entityType: 'catalogue_item',
        entityId: created.id,
        actorUserId: user.id,
        newValues: {
          name: created.name,
          defaultPrice: created.defaultPrice,
          currency: created.currency,
        },
        requestId,
      });
      return created;
    });
  }

  /** Changing an item changes future ToRs only: existing versions hold their own copy of name, days and price. */
  async update(
    id: string,
    input: CatalogueBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<CatalogueItemDto> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.catalogue.update(tx, id, {
        name: input.name,
        description: input.description?.trim() || null,
        productInterest: interestOf(input.productInterest),
        defaultDays: input.defaultDays,
        defaultPrice: input.defaultPrice,
        currency: input.currency,
        active: input.active ?? true,
      });
      if (!updated) throw new NotFoundException(NOT_FOUND);
      await this.audit.record(tx, {
        action: 'catalogue.updated',
        entityType: 'catalogue_item',
        entityId: id,
        actorUserId: user.id,
        newValues: {
          name: updated.name,
          defaultPrice: updated.defaultPrice,
          active: updated.active,
        },
        requestId,
      });
      return updated;
    });
  }
}
