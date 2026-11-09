import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionKey } from '@autonova/enums';
import type { TorDto, TorVersionDiffDto, TorVersionDto } from '@autonova/contracts';
import type { Request, Response } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { TorPdfUseCase } from '../application/tor-pdf.use-case.js';
import { TorSigningUseCases, type SignResult } from '../application/tor-signing.use-cases.js';
import { TorsUseCases } from '../application/tors.use-cases.js';
import {
  leadIdSchema,
  signSchema,
  torVersionSchema,
  versionNoSchema,
  type SignBody,
  type TorVersionBody,
} from './tors.schemas.js';
import { ApiErrors, privateErrors, VALIDATION_ERROR } from '../../../common/api-docs.js';

const LEAD = { name: 'leadId', format: 'uuid' } as const;

@ApiTags('terms-of-reference')
@ApiBearerAuth()
@ApiErrors(...privateErrors, VALIDATION_ERROR)
@Controller('leads/:leadId/tor')
export class TorsController {
  constructor(
    private readonly tors: TorsUseCases,
    private readonly signing: TorSigningUseCases,
    private readonly pdf: TorPdfUseCase,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.TorsRead)
  @ApiParam(LEAD)
  @ApiOperation({
    summary:
      'The lead’s Terms of Reference: the newest version in full and the list of all versions',
    description:
      'Visible only for leads the caller may read. 404 `TOR_NOT_FOUND` until one is created.',
  })
  get(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TorDto> {
    return this.tors.get(leadId, user);
  }

  @Post()
  @RequirePermission(PermissionKey.TorsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Create the Terms of Reference with its first draft (v1)',
    description:
      'Needs a Qualified lead and starts Scope alignment. All amounts are decimal strings; the server computes every total and returns it. Catalogue items are copied, so later catalogue edits never change this ToR.',
  })
  create(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Body({ schema: torVersionSchema }) body: TorVersionBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TorDto> {
    return this.tors.create(leadId, body, user, requestIdOf(request));
  }

  @Put('draft')
  @RequirePermission(PermissionKey.TorsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Replace the content of the current draft',
    description:
      'Only a DRAFT can be edited. A sent version is frozen (`TOR_VERSION_NOT_DRAFT`) and a signed one is locked (`TOR_SIGNED`). Editing clears any recorded discount approval.',
  })
  updateDraft(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Body({ schema: torVersionSchema }) body: TorVersionBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TorVersionDto> {
    return this.tors.updateDraft(leadId, body, user, requestIdOf(request));
  }

  @Post('versions')
  @RequirePermission(PermissionKey.TorsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Start the next scope-alignment round as a new version',
    description:
      'Copies the sent version into a new draft (v2, v3, …) and marks the old one superseded. The history is never overwritten. Refused while a draft is open and once an agreement is signed.',
  })
  newVersion(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TorVersionDto> {
    return this.tors.newVersion(leadId, null, user, requestIdOf(request));
  }

  @Get('versions/:versionNo')
  @RequirePermission(PermissionKey.TorsRead)
  @ApiParam(LEAD)
  @ApiParam({ name: 'versionNo', type: Number })
  @ApiOperation({ summary: 'Any historical version, exactly as stored' })
  version(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('versionNo', { schema: versionNoSchema }) versionNo: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TorVersionDto> {
    return this.tors.version(leadId, versionNo, user);
  }

  @Get('versions/:fromNo/diff/:toNo')
  @RequirePermission(PermissionKey.TorsRead)
  @ApiParam(LEAD)
  @ApiParam({ name: 'fromNo', type: Number })
  @ApiParam({ name: 'toNo', type: Number })
  @ApiOperation({
    summary: 'What was added, removed or changed between two versions',
    description: 'Dropped requests are listed as REMOVED so they stay part of the record.',
  })
  diff(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('fromNo', { schema: versionNoSchema }) fromNo: number,
    @Param('toNo', { schema: versionNoSchema }) toNo: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TorVersionDiffDto> {
    return this.tors.diff(leadId, fromNo, toNo, user);
  }

  @Post('approve-discount')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.TorsApprove)
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Director approves an over-threshold discount on the current draft',
    description:
      'Required before such a draft can be sent. Recorded with the approver and time; editing the draft clears it.',
  })
  approveDiscount(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TorVersionDto> {
    return this.tors.approveDiscount(leadId, user, requestIdOf(request));
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.TorsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiOperation({
    summary: 'Send the current draft for signature (freezes it)',
    description:
      'Records the content hash and freezes the version. Refused with `TOR_DISCOUNT_APPROVAL_REQUIRED` until a Director approves an over-threshold discount, and `TOR_NOTHING_IN_SCOPE` when no item is in scope. This records the send; delivery by email or WhatsApp is not built.',
  })
  send(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TorVersionDto> {
    return this.tors.send(leadId, user, requestIdOf(request));
  }

  @Post('versions/:versionNo/sign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.TorsWrite)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiParam(LEAD)
  @ApiParam({ name: 'versionNo', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['party', 'signerName'],
      properties: {
        party: { type: 'string', enum: ['CLIENT', 'AUTONOVA'] },
        signerName: { type: 'string', maxLength: 200 },
        signerTitle: { type: 'string', maxLength: 200 },
        evidenceNote: { type: 'string', maxLength: 1000 },
      },
    },
  })
  @ApiOperation({
    summary: 'Record one party’s signature on the sent version',
    description:
      'Phase 1 records a typed name that staff confirm (OTP, drawn and scanned signatures are not built). Each party signs once. When the second party signs, the same transaction locks the version, moves the lead to Won and creates exactly one client account. Only a Director may record Autonova’s signature.',
  })
  sign(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('versionNo', { schema: versionNoSchema }) versionNo: number,
    @Body({ schema: signSchema }) body: SignBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SignResult> {
    return this.signing.sign(leadId, versionNo, body, user, requestIdOf(request));
  }

  @Get('versions/:versionNo/pdf')
  @RequirePermission(PermissionKey.TorsRead)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiParam(LEAD)
  @ApiParam({ name: 'versionNo', type: Number })
  @ApiOperation({
    summary: 'The branded PDF of a stored version',
    description:
      'Generated from saved data only. A draft is watermarked as not yet an agreement in its status line.',
  })
  async pdfOf(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('versionNo', { schema: versionNoSchema }) versionNo: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.pdf.render(leadId, versionNo, user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(buffer.length));
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(buffer);
  }
}
