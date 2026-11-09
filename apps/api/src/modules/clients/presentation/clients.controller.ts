import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import type { ClientAccountDto, Paginated } from '@autonova/contracts';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { ClientsRepository } from '../infrastructure/clients.repository.js';
import { ApiErrors, privateErrors, VALIDATION_ERROR } from '../../../common/api-docs.js';

const NOT_FOUND = { code: 'CLIENT_NOT_FOUND', message: 'Client account not found' };

/**
 * Client accounts are created only by the second ToR signature (never by an endpoint here), so there is
 * no create or update route. Visibility follows lead ownership: a Director sees all, others their own.
 */
@ApiTags('clients')
@ApiBearerAuth()
@ApiErrors(...privateErrors, VALIDATION_ERROR)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsRepository) {}

  @Get()
  @RequirePermission(PermissionKey.ClientsRead)
  @ApiOperation({ summary: 'List client accounts (paginated, newest first)' })
  list(
    @Query({ schema: paginationQuerySchema }) query: { page: number; pageSize: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<ClientAccountDto>> {
    return this.clients.list(scopeFor(user), query.page, query.pageSize);
  }

  @Get('by-lead/:leadId')
  @RequirePermission(PermissionKey.ClientsRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({
    summary: 'The client account created from a lead, or 404 if it has not converted',
  })
  async byLead(
    @Param('leadId', { schema: uuidSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClientAccountDto> {
    const found = await this.clients.byLead(leadId, scopeFor(user));
    if (!found) throw new NotFoundException(NOT_FOUND);
    return found;
  }

  @Get(':id')
  @RequirePermission(PermissionKey.ClientsRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'One client account with the milestones of its signed ToR' })
  async get(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClientAccountDto> {
    const found = await this.clients.byId(id, scopeFor(user));
    if (!found) throw new NotFoundException(NOT_FOUND);
    return found;
  }
}
