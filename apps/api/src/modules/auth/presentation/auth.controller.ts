import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LoginResponse, MeResponse } from '@autonova/contracts';
import type { Request } from 'express';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import { isRestricted } from '../domain/session-authentication.js';
import { AllowRestrictedSession, AnyAuthenticatedUser, CurrentUser, Public } from './decorators.js';
import { loginBodySchema, type LoginBody } from './auth.schemas.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly logout: LogoutUseCase,
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
  signIn(
    @Body({ schema: loginBodySchema }) body: LoginBody,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    return this.login.execute({
      email: body.email,
      password: body.password,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      requestId: typeof request.id === 'string' ? request.id : undefined,
    });
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
  @ApiOperation({ summary: 'Revoke the current session' })
  async signOut(@CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.logout.execute({
      userId: user.id,
      sessionId: user.sessionId,
      requestId: typeof request.id === 'string' ? request.id : undefined,
    });
  }
}
