import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@autonova/enums';
import type { CatalogueItemDto, Paginated } from '@autonova/contracts';
import { z } from 'zod';
import { paginationQuerySchema } from '@autonova/validation';
import type { Request } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { CatalogueUseCases } from '../application/catalogue.use-cases.js';
import { catalogueSchema, idSchema, type CatalogueBody } from './tors.schemas.js';
import { ApiErrors, privateErrors, VALIDATION_ERROR } from '../../../common/api-docs.js';

const listSchema = paginationQuerySchema.extend({
  includeInactive: z.enum(['true', 'false']).optional(),
});

@ApiTags('catalogue')
@ApiBearerAuth()
@ApiErrors(...privateErrors, VALIDATION_ERROR)
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueUseCases) {}

  @Get()
  @RequirePermission(PermissionKey.CatalogueRead)
  @ApiOperation({ summary: 'Reusable scope items (paginated, active only unless asked)' })
  list(
    @Query({ schema: listSchema }) query: z.infer<typeof listSchema>,
  ): Promise<Paginated<CatalogueItemDto>> {
    return this.catalogue.list(query.page, query.pageSize, query.includeInactive === 'true');
  }

  @Post()
  @RequirePermission(PermissionKey.CatalogueManage)
  @ApiOperation({ summary: 'Add a catalogue item (Director only)' })
  create(
    @Body({ schema: catalogueSchema }) body: CatalogueBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CatalogueItemDto> {
    return this.catalogue.create(body, user, requestIdOf(request));
  }

  @Put(':id')
  @RequirePermission(PermissionKey.CatalogueManage)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Edit a catalogue item (Director only)',
    description:
      'Affects only ToRs created afterwards: existing versions keep the values they copied.',
  })
  update(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: catalogueSchema }) body: CatalogueBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CatalogueItemDto> {
    return this.catalogue.update(id, body, user, requestIdOf(request));
  }
}
