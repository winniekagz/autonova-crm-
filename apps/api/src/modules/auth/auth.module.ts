import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './application/access-token.service.js';
import { BootstrapDirectorUseCase } from './application/bootstrap-director.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { PasswordHasher } from './application/password-hasher.js';
import { SessionAuthenticator } from './application/session-authenticator.js';
import { AuthRepository } from './infrastructure/auth.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    PasswordHasher,
    AccessTokenService,
    SessionAuthenticator,
    LoginUseCase,
    LogoutUseCase,
    BootstrapDirectorUseCase,
    // Global and deny-by-default: every route in the application is private unless @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PasswordHasher, BootstrapDirectorUseCase, AuthRepository],
})
export class AuthModule {}
