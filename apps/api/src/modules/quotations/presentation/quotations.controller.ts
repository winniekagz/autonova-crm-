import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionKey } from '@autonova/enums';
import type { Paginated, QuotationDto } from '@autonova/contracts';
import type { Request, Response } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { QuotationPdfUseCase } from '../application/quotation-pdf.use-case.js';
import { QuotationsUseCases } from '../application/quotations.use-cases.js';
import {
  fromTorSchema,
  idSchema,
  listQuerySchema,
  quickQuoteSchema,
  quotationStatusSchema,
  type FromTorBody,
  type QuickQuoteBody,
  type QuotationStatusBody,
} from './quotations.schemas.js';
import { ApiErrors, privateErrors, VALIDATION_ERROR } from '../../../common/api-docs.js';

const LEAD = { name: 'leadId', format: 'uuid' } as const;

@ApiTags('quotations')
@ApiBearerAuth()
@ApiErrors(...privateErrors, VALIDATION_ERROR)
@Controller('leads/:leadId/quotations')
export class QuotationsController {
  constructor(
    private readonly quotes: QuotationsUseCases,
    private readonly pdf: QuotationPdfUseCase,
    private readonly leads: LeadsRepository,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.QuotationsRead)
  @ApiParam(LEAD)
  @ApiOperation({ summary: 'A lead’s quotations, newest first (paginated)' })
  list(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Query({ schema: listQuerySchema }) query: { page: number; pageSize: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<QuotationDto>> {
    return this.quotes.list(leadId, query.page, query.pageSize, user);
  }

  @Post('from-tor')
  @RequirePermission(PermissionKey.QuotationsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Generate a quotation from the latest sent ToR version',
    description:
      'Copies the stored figures of that version (nothing is recalculated) and records which version it came from. `validUntil` defaults to the configured validity period.',
  })
  fromTor(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Body({ schema: fromTorSchema }) body: FromTorBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.quotes.fromTor(leadId, body, user, requestIdOf(request));
  }

  @Post('quick')
  @RequirePermission(PermissionKey.QuotationsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'A standalone quick quotation for a simple deal',
    description: 'Priced lines only. The server computes every total.',
  })
  quick(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Body({ schema: quickQuoteSchema }) body: QuickQuoteBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.quotes.quick(leadId, body, user, requestIdOf(request));
  }

  @Get(':id')
  @RequirePermission(PermissionKey.QuotationsRead)
  @ApiParam(LEAD)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'One quotation of this lead' })
  get(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuotationDto> {
    return this.quotes.get(leadId, id, user);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.QuotationsWrite)
  @ApiParam(LEAD)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Move a quotation through its lifecycle',
    description:
      'DRAFT to SENT, then ACCEPTED or REJECTED. `EXPIRED` is applied by the system. **Accepting a quotation never changes the lead or the Terms of Reference**: only both parties signing the same ToR version converts a deal.',
  })
  setStatus(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: quotationStatusSchema }) body: QuotationStatusBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.quotes.setStatus(leadId, id, body, user, requestIdOf(request));
  }

  @Get(':id/pdf')
  @RequirePermission(PermissionKey.QuotationsRead)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'The branded PDF of a quotation, generated from saved data' })
  async pdfOf(
    @Param('leadId', { schema: idSchema }) leadId: string,
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    const { buffer, fileName } = await this.pdf.render(leadId, id, lead?.name ?? 'Client', user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(buffer.length));
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(buffer);
  }
}
