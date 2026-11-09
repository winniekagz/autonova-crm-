import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionKey } from '@autonova/enums';
import type { PipelineSummaryDto } from '@autonova/contracts';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../auth/presentation/decorators.js';
import { PipelineService } from './pipeline.service.js';
import { ApiErrors, privateErrors } from '../../common/api-docs.js';

@ApiTags('pipeline')
@ApiBearerAuth()
@ApiErrors(...privateErrors)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get('summary')
  @RequirePermission(PermissionKey.LeadsList)
  @ApiOperation({
    summary:
      'Counts for the dashboard: leads by stage, qualified opportunities, ToRs awaiting signature, signed, won, lost, overdue follow-ups',
    description:
      'Scoped like the lead list: a Director sees every lead, others only their own. Counts only; no record details.',
  })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<PipelineSummaryDto> {
    return this.pipeline.summary(user);
  }
}
