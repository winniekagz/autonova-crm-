import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionKey } from '@autonova/enums';
import type {
  LeadDto,
  Paginated,
  QualificationDto,
  QualificationSettingsDto,
} from '@autonova/contracts';
import type { Request } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { QualificationUseCases } from '../application/qualification.use-cases.js';
import {
  assessSchema,
  bantSettingsSchema,
  leadIdSchema,
  listQuerySchema,
  qualifySchema,
  type AssessBody,
  type BantSettingsBody,
  type QualifyBody,
} from './qualification.schemas.js';
import { ApiErrors, privateErrors, VALIDATION_ERROR } from '../../../common/api-docs.js';

@ApiTags('qualification')
@ApiBearerAuth()
@ApiErrors(...privateErrors, VALIDATION_ERROR)
@Controller()
export class QualificationController {
  constructor(private readonly qualification: QualificationUseCases) {}

  @Get('leads/:leadId/qualification')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({
    summary: 'The latest BANT assessment of a lead, or null',
    description: 'Visible only for leads the caller may read.',
  })
  current(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QualificationDto | null> {
    return this.qualification.current(leadId, user);
  }

  @Get('leads/:leadId/qualification/history')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({ summary: 'Every BANT assessment of a lead, newest first (paginated)' })
  history(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Query({ schema: listQuerySchema }) query: { page: number; pageSize: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<QualificationDto>> {
    return this.qualification.history(leadId, query.page, query.pageSize, user);
  }

  @Post('leads/:leadId/qualification')
  @RequirePermission(PermissionKey.LeadsUpdate)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({
    summary: 'Record a BANT assessment',
    description:
      'Send the four ratings (`NOT_MET`, `PARTIALLY_MET`, `FULLY_MET`). The server calculates the score out of 100 with the configured weights and pass mark; a `score` in the body is rejected.',
  })
  assess(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Body({ schema: assessSchema }) body: AssessBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QualificationDto> {
    return this.qualification.assess(leadId, body, user, requestIdOf(request));
  }

  @Post('leads/:leadId/qualify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.LeadsUpdate)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({
    summary: 'Move a lead to Qualified',
    description:
      'Allowed only when the latest BANT assessment passed. A failing assessment can be qualified only by a Director who sends `overrideReason`; the override is recorded in the stage history and audit trail.',
  })
  qualify(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Body({ schema: qualifySchema }) body: QualifyBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<LeadDto> {
    return this.qualification.qualify(leadId, body, user, requestIdOf(request));
  }

  @Get('settings/qualification')
  @RequirePermission(PermissionKey.LeadsRead)
  @ApiOperation({ summary: 'The BANT weights and pass mark in force' })
  settings(): Promise<QualificationSettingsDto> {
    return this.qualification.settingsDto();
  }

  @Put('settings/qualification')
  @RequirePermission(PermissionKey.SettingsManage)
  @ApiOperation({
    summary: 'Set the BANT weights and pass mark (Director only)',
    description:
      'Weights must be whole numbers adding up to 100. Past assessments keep the values they were scored with.',
  })
  updateSettings(
    @Body({ schema: bantSettingsSchema }) body: BantSettingsBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QualificationSettingsDto> {
    return this.qualification.updateSettings(body, user, requestIdOf(request));
  }
}
