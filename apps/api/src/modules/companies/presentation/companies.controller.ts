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
import type {
  CompanyDto,
  CompanyDuplicateCheckResult,
  CompanyLeadDto,
  Paginated,
} from '@autonova/contracts';
import type { Request } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { CompaniesUseCases } from '../application/companies.use-cases.js';
import { CompanyDuplicatesService } from '../application/company-duplicates.service.js';
import {
  DocArchiveCompany,
  DocCompanyDuplicateCheck,
  DocCompanyLeads,
  DocCreateCompany,
  DocGetCompany,
  DocListCompanies,
  DocRestoreCompany,
  DocUpdateCompany,
  companyBodySchema,
} from './companies.docs.js';
import {
  archiveSchema,
  companyDuplicateCheckSchema,
  companyIdSchema,
  companyLeadsQuerySchema,
  createCompanySchema,
  listCompaniesQuerySchema,
  updateCompanySchema,
  type ArchiveBody,
  type CompanyDuplicateCheckBody,
  type CompanyLeadsQuery,
  type CreateCompanyBody,
  type ListCompaniesQuery,
  type UpdateCompanyBody,
} from './companies.schemas.js';

const PAGE = [
  { name: 'page', required: false, type: Number, description: '1-based page; defaults to 1.' },
  { name: 'pageSize', required: false, type: Number, description: 'Defaults to 25; maximum 100.' },
] as const;

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesUseCases,
    private readonly duplicates: CompanyDuplicatesService,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.CompaniesList)
  @ApiOperation({
    summary: 'List and search companies in the caller’s permitted scope',
    description:
      'Directors see every company. Other users see companies they created or that have one of their own leads. `q` matches name (ignoring case, punctuation and Ltd/Limited), exact KRA PIN, and location.',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'industry', required: false, type: String })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: String,
    description: '`true` to include archived companies.',
  })
  @ApiQuery(PAGE[0])
  @ApiQuery(PAGE[1])
  @DocListCompanies()
  list(
    @Query({ schema: listCompaniesQuerySchema }) query: ListCompaniesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<CompanyDto>> {
    return this.companies.list(query, user);
  }

  @Post()
  @RequirePermission(PermissionKey.CompaniesCreate)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Create a company',
    description:
      'The same KRA PIN as a live company is refused (`COMPANY_KRA_PIN_EXISTS`). A matching normalised name returns `COMPANY_DUPLICATE_SUSPECTED` until the request is resent with `acknowledgeDuplicates: true`.',
  })
  @ApiBody({ schema: companyBodySchema })
  @DocCreateCompany()
  create(
    @Body({ schema: createCompanySchema }) body: CreateCompanyBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CompanyDto> {
    return this.companies.create(body, user, requestIdOf(request));
  }

  @Post('duplicate-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.CompaniesCreate)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Check a name and KRA PIN against existing companies',
    description:
      'Returns definite matches (same KRA PIN) and potential matches (same normalised name) the caller may see, plus a count of matches they may not. Archived companies are included so they can be restored instead of duplicated.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', maxLength: 200 },
        kraPin: { type: 'string' },
        excludeCompanyId: {
          type: 'string',
          format: 'uuid',
          description: 'The company being edited.',
        },
      },
    },
  })
  @DocCompanyDuplicateCheck()
  duplicateCheck(
    @Body({ schema: companyDuplicateCheckSchema }) body: CompanyDuplicateCheckBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CompanyDuplicateCheckResult> {
    return this.duplicates.check(body, user);
  }

  @Get(':id')
  @RequirePermission(PermissionKey.CompaniesRead)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'View a company in the caller’s permitted scope' })
  @DocGetCompany()
  get(
    @Param('id', { schema: companyIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CompanyDto> {
    return this.companies.get(id, user);
  }

  @Patch(':id')
  @RequirePermission(PermissionKey.CompaniesUpdate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update a company',
    description:
      'Only supplied fields change. Duplicate rules apply only when the name or KRA PIN actually changes.',
  })
  @ApiBody({ schema: { ...companyBodySchema, required: [] } })
  @DocUpdateCompany()
  update(
    @Param('id', { schema: companyIdSchema }) id: string,
    @Body({ schema: updateCompanySchema }) body: UpdateCompanyBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CompanyDto> {
    return this.companies.update(id, body, user, requestIdOf(request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.CompaniesArchive)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Archive a company',
    description:
      'Refused while the company has open leads. Archived companies keep their history and release their KRA PIN.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { reason: { type: 'string', maxLength: 500 } },
    },
  })
  @DocArchiveCompany()
  archive(
    @Param('id', { schema: companyIdSchema }) id: string,
    @Body({ schema: archiveSchema }) body: ArchiveBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CompanyDto> {
    return this.companies.archive(id, body, user, requestIdOf(request));
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.CompaniesArchive)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Restore an archived company',
    description: 'Refused if its KRA PIN now belongs to another live company.',
  })
  @DocRestoreCompany()
  restore(
    @Param('id', { schema: companyIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CompanyDto> {
    return this.companies.restore(id, user, requestIdOf(request));
  }

  @Get(':id/leads')
  @RequirePermission(PermissionKey.CompaniesRead, PermissionKey.LeadsList)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery(PAGE[0])
  @ApiQuery(PAGE[1])
  @ApiOperation({
    summary: 'List the leads of a company',
    description: 'Directors see every lead of the company; other users only the leads they own.',
  })
  @DocCompanyLeads()
  leads(
    @Param('id', { schema: companyIdSchema }) id: string,
    @Query({ schema: companyLeadsQuerySchema }) query: CompanyLeadsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<CompanyLeadDto>> {
    return this.companies.leads(id, query, user);
  }
}
