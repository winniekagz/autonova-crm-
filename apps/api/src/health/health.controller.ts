import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../modules/auth/presentation/decorators.js';
import { DatabaseHealthIndicator } from './database.health.js';

/** The body Terminus returns (`HealthResponse` in `@autonova/contracts`), for both 200 and 503. */
const healthSchema = {
  type: 'object',
  required: ['status', 'details'],
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    info: { type: 'object', additionalProperties: true },
    error: { type: 'object', additionalProperties: true },
    details: {
      type: 'object',
      description: 'One entry per check, e.g. `database`.',
      additionalProperties: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['up', 'down'] } },
      },
    },
  },
};

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({
    summary: 'Liveness: the process is running. Does not touch dependencies.',
    description: 'Public. Use for a container or process liveness probe.',
  })
  @ApiResponse({
    status: 200,
    description: 'The process is up.',
    schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
  })
  live() {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness: the API can serve traffic (database reachable).',
    description:
      'Public. Checks the database. Use for a load-balancer or deployment readiness probe.',
  })
  @ApiResponse({
    status: 200,
    description: 'The API and its database are healthy.',
    schema: healthSchema,
  })
  @ApiResponse({
    status: 503,
    description: 'A dependency is down; the body names which check failed.',
    schema: healthSchema,
  })
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
