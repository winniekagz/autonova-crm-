import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { LoginResponse, MeResponse, RefreshResponse, SessionDto } from '@autonova/contracts';
import type { Request, Response } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { AuthMfaService } from '../application/mfa.service.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { ListSessionsUseCase, RevokeSessionUseCase } from '../application/sessions.use-cases.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import { looksLikeRefreshToken, readCookie } from '../domain/refresh-token.js';
import { isRestricted } from '../domain/session-authentication.js';
import { AllowRestrictedSession, AnyAuthenticatedUser, CurrentUser, Public } from './decorators.js';
import {
  loginBodySchema,
  mfaCodeBodySchema,
  mfaRecoveryBodySchema,
  sessionIdParamSchema,
  type LoginBody,
} from './auth.schemas.js';
import {
  DocListSessions,
  DocLogin,
  DocLogout,
  DocMe,
  DocMfaBeginEnrollment,
  DocMfaConfirmEnrollment,
  DocMfaRecover,
  DocMfaStatus,
  DocMfaVerify,
  DocRefresh,
  DocRevokeSession,
} from './auth.docs.js';
import { BrowserRequestGuard } from './browser-request.guard.js';
import { REFRESH_COOKIE_NAME, RefreshCookie } from './refresh-cookie.js';

/** One answer for every refresh failure, so the response never says why a token was refused. */
export const REFRESH_REJECTED = {
  code: 'REFRESH_TOKEN_INVALID',
  message: 'Your session has ended. Sign in again.',
} as const;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly logout: LogoutUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly listSessions: ListSessionsUseCase,
    private readonly revokeSession: RevokeSessionUseCase,
    private readonly refreshCookie: RefreshCookie,
    private readonly mfa: AuthMfaService,
  ) {}

  @Public()
  // Brute-force ceiling per client address, in addition to the global limit.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @DocLogin()
  async signIn(
    @Body({ schema: loginBodySchema }) body: LoginBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.login.execute({
      email: body.email,
      password: body.password,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      requestId: requestIdOf(request),
    });
    this.refreshCookie.set(response, result.refreshToken);
    return result.body;
  }

  /**
   * @Public() only because there is no access token to present: the caller is authenticated by the
   * refresh cookie instead, and `RefreshSessionUseCase` performs ALL of the checks (token, session,
   * user status, MFA gating). `BrowserRequestGuard` adds Origin + custom-header CSRF protection.
   */
  @Public()
  @UseGuards(BrowserRequestGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @DocRefresh()
  async refreshSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    const raw = readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    if (!raw || !looksLikeRefreshToken(raw)) throw new UnauthorizedException(REFRESH_REJECTED);

    const outcome = await this.refresh.execute({
      rawToken: raw,
      ip: request.ip ?? null,
      requestId: requestIdOf(request),
    });
    if (!outcome.ok) {
      // The cookie is useless now; remove it so the browser stops sending it.
      this.refreshCookie.clear(response);
      throw new UnauthorizedException(REFRESH_REJECTED);
    }
    this.refreshCookie.set(response, outcome.refreshToken);
    return outcome.response;
  }

  @Get('me')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @DocMe()
  me(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      permissions: user.permissions,
      mfa: { required: user.mfaRequired, verified: user.mfaVerified },
      restricted: isRestricted(user),
    };
  }

  @Get('mfa/status')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @DocMfaStatus()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check whether Director MFA enrollment is complete',
    description:
      'Use after login. A first-time Director receives `{ enrolled: false }`; a completed enrollment returns `{ enrolled: true }`. This route is available while the Director session is restricted.',
  })
  @ApiResponse({ status: 200, description: 'Enrollment state for the signed-in Director.' })
  mfaStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.status(user);
  }

  @Post('mfa/enrollment')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @DocMfaBeginEnrollment()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start Director TOTP enrollment',
    description:
      'Returns a one-time setup secret and `otpauth://` URI. Add them to an authenticator app, then submit its current six-digit code to the confirmation endpoint. Treat the secret and URI as credentials.',
  })
  @ApiResponse({
    status: 201,
    description: 'TOTP setup material. The secret is only returned during enrollment.',
    schema: {
      type: 'object',
      required: ['secret', 'uri'],
      properties: {
        secret: { type: 'string', description: 'Base32 secret; keep private.' },
        uri: { type: 'string', format: 'uri', description: 'otpauth URI for authenticator setup.' },
      },
    },
  })
  beginMfaEnrollment(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.beginEnrollment(user);
  }

  @Post('mfa/enrollment/confirm')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @DocMfaConfirmEnrollment()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm TOTP enrollment and receive one-time recovery codes' })
  @ApiResponse({
    status: 201,
    description:
      'Enrollment is activated, this session is verified, and ten recovery codes are returned once. Save the codes securely; they cannot be fetched again.',
    schema: {
      type: 'object',
      required: ['recoveryCodes'],
      properties: {
        recoveryCodes: {
          type: 'array',
          minItems: 10,
          maxItems: 10,
          items: { type: 'string', example: '0123-4567-89AB-CDEF-0123-4567-89AB-CDEF' },
        },
      },
    },
  })
  @ApiBody({
    examples: {
      currentTotp: {
        summary: 'Replace with the current authenticator code',
        value: { code: '123456' },
      },
    },
    schema: {
      type: 'object',
      required: ['code'],
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          pattern: '^\\d{6}$',
          example: '123456',
          description: 'Replace with the current six-digit code in your authenticator app.',
        },
      },
    },
  })
  confirmMfaEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: mfaCodeBodySchema }) body: { code: string },
    @Req() request: Request,
  ) {
    return this.mfa.confirmEnrollment({
      user,
      code: body.code,
      requestId: requestIdOf(request),
    });
  }

  @Post('mfa/verify')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @DocMfaVerify()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify TOTP for the current restricted Director session',
    description:
      'For a later login, submit a current six-digit authenticator code. A successful request returns 201 with an empty body and verifies only this session. TOTP steps are single-use; wait for a fresh code if the current one was already submitted.',
  })
  @ApiResponse({ status: 201, description: 'This session is now MFA-verified.' })
  @ApiBody({
    examples: {
      currentTotp: {
        summary: 'Replace with a fresh code from the authenticator',
        value: { code: '123456' },
      },
    },
    schema: {
      type: 'object',
      required: ['code'],
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          pattern: '^\\d{6}$',
          example: '123456',
          description: 'Replace with the current six-digit code in your authenticator app.',
        },
      },
    },
  })
  async verifyMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: mfaCodeBodySchema }) body: { code: string },
    @Req() request: Request,
  ): Promise<void> {
    await this.mfa.verifyCode({
      user,
      code: body.code,
      requestId: requestIdOf(request),
    });
  }

  @Post('mfa/recover')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @DocMfaRecover()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Use one recovery code to clear enrollment and require TOTP setup again',
    description:
      'Consumes one saved recovery code, clears MFA enrollment, and marks all of the Director’s sessions restricted. Use only for recovery testing with a disposable local account. Re-enroll and confirm TOTP afterward.',
  })
  @ApiResponse({
    status: 201,
    description: 'Recovery code consumed; all sessions require enrollment again.',
  })
  @ApiBody({
    examples: {
      unusedRecoveryCode: {
        summary: 'Replace with an unused code returned by enrollment',
        value: { code: '0123-4567-89AB-CDEF-0123-4567-89AB-CDEF' },
      },
    },
    schema: {
      type: 'object',
      required: ['code'],
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          pattern: '^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){7})$',
          example: '0123-4567-89AB-CDEF-0123-4567-89AB-CDEF',
          description: 'Use one of the recovery codes returned by enrollment confirmation.',
        },
      },
    },
  })
  async recoverMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: mfaRecoveryBodySchema }) body: { code: string },
    @Req() request: Request,
  ): Promise<void> {
    await this.mfa.recover({
      user,
      code: body.code,
      requestId: requestIdOf(request),
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @DocLogout()
  async signOut(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logout.execute({
      userId: user.id,
      sessionId: user.sessionId,
      requestId: requestIdOf(request),
    });
    this.refreshCookie.clear(response);
  }

  @Get('sessions')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @DocListSessions()
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    return this.listSessions.execute({ userId: user.id, currentSessionId: user.sessionId });
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @DocRevokeSession()
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', { schema: sessionIdParamSchema }) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.revokeSession.execute({
      userId: user.id,
      sessionId,
      currentSessionId: user.sessionId,
      requestId: requestIdOf(request),
    });
    if (result.current) this.refreshCookie.clear(response);
  }
}
