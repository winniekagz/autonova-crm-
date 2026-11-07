import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../modules/auth/presentation/decorators.js';
import { DatabaseHealthIndicator } from './database.health.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is running. Does not touch dependencies.' })
  live() {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness: the API can serve traffic (database reachable).' })
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
