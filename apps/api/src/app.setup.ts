import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { swaggerEnabled, type Env } from './config/env.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { createValidationPipe } from './common/validation.pipe.js';
import { CSRF_HEADER } from './modules/auth/domain/browser-request.js';

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
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id', CSRF_HEADER],
  });
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
            'REST API for the Autonova CRM. This document describes implemented endpoints only; planned CRM areas are not available yet. The complete request guide is in `docs/api-reference.md`.',
            '',
            '## Quick start',
            '',
            '1. Call `GET /api/v1/health` and confirm the database check is healthy.',
            '2. Call `POST /api/v1/auth/login` with a provisioned account. Copy `accessToken` from the response and click **Authorize**; enter the token as a Bearer token (without surrounding quotes).',
            '3. Call `GET /api/v1/auth/me` to inspect the current roles, permissions, and MFA state. Access tokens expire after 15 minutes by default.',
            '4. Use the endpoint tag descriptions below to follow the Director TOTP setup, then test only endpoints allowed by the signed-in account’s permissions.',
            '',
            '## First Director TOTP setup',
            '',
            'A Director’s login creates a restricted session until MFA is verified. Keep the same bearer token authorized while enrolling:',
            '',
            '1. `GET /api/v1/auth/mfa/status` should return `{ "enrolled": false }` for a first-time setup.',
            '2. `POST /api/v1/auth/mfa/enrollment` returns a `secret` and `uri`. Add the secret to an authenticator app, or use its QR-code flow in the Autonova web UI. Treat the secret/URI as a password; never include it in screenshots or tickets.',
            '3. Read the current six-digit TOTP from the authenticator and call `POST /api/v1/auth/mfa/enrollment/confirm` with `{ "code": "123456" }`. Replace the sample digits with the current code. The response contains recovery codes **once**; save them securely.',
            '4. `GET /api/v1/auth/me` should now show `mfa.required: true`, `mfa.verified: true`, and `restricted: false` for this session.',
            '5. To test a later login, sign in again, authorize with the new access token, and call `POST /api/v1/auth/mfa/verify` with the current authenticator code. Use a fresh time step; a TOTP code cannot be replayed.',
            '',
            'For recovery testing, `POST /api/v1/auth/mfa/recover` consumes one saved recovery code, clears enrollment, and restricts all of that Director’s sessions. Re-enroll and confirm again. Do this only with a disposable local test account: recovery codes are single-use and every session must re-enroll.',
            '',
            '## Testing other API groups',
            '',
            '- **health**: liveness and database readiness are public.',
            '- **auth**: login, current user, MFA, logout, and own-session list/revoke. In the local Swagger UI, sign in first so the browser stores the HttpOnly refresh cookie; Swagger adds the CSRF header automatically for refresh. Refresh still requires the Swagger origin to be listed in `CORS_ORIGINS`.',
            '- **users** and **roles**: require the named permissions shown in each operation. Inviting a user sends a one-time setup link; the public acceptance route (`POST /auth/invitations/accept`, no sign-in) activates the account after the user chooses a password. To try it, invite a user, then copy the `token` from the link in the email (it follows `#token=`).',
            '- **leads**: create, list/search, read, and update. Director sees all leads; Business Development sees only owned leads. Creation assigns the lead to the caller. Stage changes and owner reassignment are not implemented.',
            '',
            '## Errors',
            '',
            'Every failure uses one body: `{ statusCode, code, message, details?, requestId, timestamp, path }`. Branch on `code`, which is stable; `message` is for people. `details` lists the offending fields for validation failures. Quote `requestId` (also the `x-request-id` header) when reporting a problem. Each operation below lists the `code` values it can return.',
            '',
            '- `400` invalid input (`VALIDATION_FAILED`), `401` sign-in or token problem (`UNAUTHENTICATED`, or `TOKEN_EXPIRED` for a timed-out token), `403` missing permission or an unverified Director session (`FORBIDDEN`, `MFA_REQUIRED`), `404` not found, `409` conflict, `422` a business rule refused the change, `429` rate limited, `503` a dependency such as email failed.',
            '- Wrong credentials, an unknown email and a disabled account all return the same `INVALID_CREDENTIALS`; an expired, used or unknown invitation or refresh token each return one generic code. This is deliberate: the cause is never disclosed.',
            '- Avoid repeated invalid MFA codes: five failures trigger a 15-minute lock (`MFA_RATE_LIMITED`).',
            '',
            'Download the machine-readable OpenAPI file from `/api/docs-json`. The local `localhost` URLs are not reachable by stakeholders on other machines; publish this spec from an approved staging host before sharing.',
          ].join('\n'),
        )
        .setVersion('0.0.0')
        .addTag('health', 'Service and database availability; no sign-in required.')
        .addTag(
          'auth',
          'Sign in, complete Director TOTP, inspect, and manage the current session. Follow the MFA test sequence in the API overview above.',
        )
        .addTag('users', 'User administration; requires the matching user permission.')
        .addTag('roles', 'Available system roles; requires roles:list.')
        .addTag(
          'leads',
          'Lead capture and maintenance; Director sees all leads and BD users see their own.',
        )
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      swaggerOptions: {
        requestInterceptor: (request: {
          url?: string;
          headers?: Record<string, string>;
          credentials?: 'omit' | 'same-origin' | 'include';
        }) => {
          if (request.url?.endsWith('/api/v1/auth/refresh')) {
            request.headers = { ...request.headers, 'X-Autonova-CSRF': '1' };
            request.credentials = 'include';
          }
          return request;
        },
      },
    });
  }
}
