import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './application/access-token.service.js';
import { BootstrapDirectorUseCase } from './application/bootstrap-director.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { AuthMfaService } from './application/mfa.service.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { PasswordHasher } from './application/password-hasher.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { RefreshTokenService } from './application/refresh-token.service.js';
import { ListSessionsUseCase, RevokeSessionUseCase } from './application/sessions.use-cases.js';
import { SessionAuthenticator } from './application/session-authenticator.js';
import { AuthRepository } from './infrastructure/auth.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';
import { BrowserRequestGuard } from './presentation/browser-request.guard.js';
import { RefreshCookie } from './presentation/refresh-cookie.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    PasswordHasher,
    AccessTokenService,
    SessionAuthenticator,
    LoginUseCase,
    AuthMfaService,
    LogoutUseCase,
    RefreshTokenService,
    RefreshSessionUseCase,
    ListSessionsUseCase,
    RevokeSessionUseCase,
    RefreshCookie,
    BrowserRequestGuard,
    BootstrapDirectorUseCase,
    // Global and deny-by-default: every route in the application is private unless @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PasswordHasher, BootstrapDirectorUseCase, AuthRepository],
})
export class AuthModule {}
