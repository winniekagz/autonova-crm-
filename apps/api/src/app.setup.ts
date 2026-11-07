import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { swaggerEnabled, type Env } from './config/env.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { createValidationPipe } from './common/validation.pipe.js';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/** Shared by main.ts and the e2e tests so tests exercise the real pipeline. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  // Behind a reverse proxy the real client IP (rate limiting, session records) is in X-Forwarded-For.
  // Trust exactly N hops, never `true`: a client could otherwise spoof its own address.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }), credentials: true });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (
    swaggerEnabled({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      SWAGGER_ENABLED: config.get('SWAGGER_ENABLED', { infer: true }),
    })
  ) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Autonova CRM API')
        .setDescription(
          [
            'REST API for the Autonova CRM. This is the current implementation snapshot, not a promise that planned CRM areas are already available.',
            '',
            'Start with the health endpoints to check service and database availability. Sign in at POST /api/v1/auth/login; copy the accessToken into Authorize as a Bearer token to try protected endpoints. Access tokens are short-lived. The refresh token is held in an HttpOnly cookie and is not shown here.',
            '',
            'Currently implemented: health checks, sign-in/session inspection/logout, user administration, and role listing. Other business workflows are documented as planned and are not yet API endpoints.',
            '',
            'For endpoint status, example requests, permissions, and error formats, see docs/api-reference.md. Download the machine-readable OpenAPI file from /api/docs-json.',
          ].join('\n'),
        )
        .setVersion('0.0.0')
        .addTag('health', 'Service and database availability; no sign-in required.')
        .addTag('auth', 'Sign in and manage the current session.')
        .addTag('users', 'User administration; requires the matching user permission.')
        .addTag('roles', 'Available system roles; requires roles:list.')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document);
  }
}
