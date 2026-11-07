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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { LoginResponse, MeResponse, RefreshResponse, SessionDto } from '@autonova/contracts';
import type { Request, Response } from 'express';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { ListSessionsUseCase, RevokeSessionUseCase } from '../application/sessions.use-cases.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import { looksLikeRefreshToken, readCookie } from '../domain/refresh-token.js';
import { isRestricted } from '../domain/session-authentication.js';
import { AllowRestrictedSession, AnyAuthenticatedUser, CurrentUser, Public } from './decorators.js';
import { loginBodySchema, sessionIdParamSchema, type LoginBody } from './auth.schemas.js';
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
  ) {}

  @Public()
  // Brute-force ceiling per client address, in addition to the global limit.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
    },
  })
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
      requestId: typeof request.id === 'string' ? request.id : undefined,
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
  @ApiOperation({
    summary: 'Exchange the HttpOnly refresh cookie for a new access token',
    description:
      'Reads the refresh token from the `autonova_refresh` cookie, rotates it (the old one stops working) and returns a new access token. Requires an allowed `Origin` and the `X-Autonova-CSRF: 1` header. Cannot be exercised from Swagger UI.',
  })
  async refreshSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    const raw = readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    if (!raw || !looksLikeRefreshToken(raw)) throw new UnauthorizedException(REFRESH_REJECTED);

    const outcome = await this.refresh.execute({
      rawToken: raw,
      ip: request.ip ?? null,
      requestId: typeof request.id === 'string' ? request.id : undefined,
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
  @ApiOperation({ summary: 'Current user with current roles and permissions' })
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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session and its refresh tokens' })
  async signOut(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logout.execute({
      userId: user.id,
      sessionId: user.sessionId,
      requestId: typeof request.id === 'string' ? request.id : undefined,
    });
    this.refreshCookie.clear(response);
  }

  @Get('sessions')
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List your own active sessions' })
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    return this.listSessions.execute({ userId: user.id, currentSessionId: user.sessionId });
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AnyAuthenticatedUser()
  @AllowRestrictedSession()
  @ApiBearerAuth()
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiOperation({
    summary: 'Revoke one of your own sessions',
    description:
      'Revokes the session and every refresh token it owns. Revoking the current session also clears the refresh cookie. Unknown, foreign and already-ended sessions all answer 404.',
  })
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
      requestId: typeof request.id === 'string' ? request.id : undefined,
    });
    if (result.current) this.refreshCookie.clear(response);
  }
}
