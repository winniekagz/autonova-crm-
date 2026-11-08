import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionKey } from '@autonova/enums';
import type { ContactDto, Paginated } from '@autonova/contracts';
import type { Request } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { ContactsUseCases } from '../application/contacts.use-cases.js';
import {
  DocArchiveContact,
  DocCreateContact,
  DocGetContact,
  DocListContacts,
  DocRestoreContact,
  DocUpdateContact,
  contactBodySchema,
} from './companies.docs.js';
import {
  archiveSchema,
  companyIdSchema,
  contactIdSchema,
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
  type ArchiveBody,
  type CreateContactBody,
  type ListContactsQuery,
  type UpdateContactBody,
} from './companies.schemas.js';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactsUseCases) {}

  @Get('companies/:companyId/contacts')
  @RequirePermission(PermissionKey.CompaniesRead)
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @ApiQuery({ name: 'includeArchived', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOperation({
    summary: 'List the contacts of a company',
    description: 'Decision-makers first, then by name.',
  })
  @DocListContacts()
  list(
    @Param('companyId', { schema: companyIdSchema }) companyId: string,
    @Query({ schema: listContactsQuerySchema }) query: ListContactsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<ContactDto>> {
    return this.contacts.list(companyId, query, user);
  }

  @Post('companies/:companyId/contacts')
  @RequirePermission(PermissionKey.CompaniesCreate)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @ApiOperation({
    summary: 'Add a contact to a company',
    description:
      'A contact belongs to one company for life. Phone and email are not unique: colleagues may share them.',
  })
  @ApiBody({ schema: contactBodySchema })
  @DocCreateContact()
  create(
    @Param('companyId', { schema: companyIdSchema }) companyId: string,
    @Body({ schema: createContactSchema }) body: CreateContactBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ContactDto> {
    return this.contacts.create(companyId, body, user, requestIdOf(request));
  }

  @Get('contacts/:id')
  @RequirePermission(PermissionKey.CompaniesRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'View a contact whose company the caller may see' })
  @DocGetContact()
  get(
    @Param('id', { schema: contactIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactDto> {
    return this.contacts.get(id, user);
  }

  @Patch('contacts/:id')
  @RequirePermission(PermissionKey.CompaniesUpdate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update a contact',
    description: 'Only supplied fields change; the company cannot be changed.',
  })
  @ApiBody({ schema: { ...contactBodySchema, required: [] } })
  @DocUpdateContact()
  update(
    @Param('id', { schema: contactIdSchema }) id: string,
    @Body({ schema: updateContactSchema }) body: UpdateContactBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ContactDto> {
    return this.contacts.update(id, body, user, requestIdOf(request));
  }

  @Post('contacts/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.CompaniesArchive)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Archive a contact',
    description: 'Refused while a lead still uses the contact.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { reason: { type: 'string', maxLength: 500 } },
    },
  })
  @DocArchiveContact()
  archive(
    @Param('id', { schema: contactIdSchema }) id: string,
    @Body({ schema: archiveSchema }) body: ArchiveBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ContactDto> {
    return this.contacts.archive(id, body, user, requestIdOf(request));
  }

  @Post('contacts/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.CompaniesArchive)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Restore an archived contact' })
  @DocRestoreContact()
  restore(
    @Param('id', { schema: contactIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ContactDto> {
    return this.contacts.restore(id, user, requestIdOf(request));
  }
}
