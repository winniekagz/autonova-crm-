import { SystemRoleKey, UserStatus } from '@autonova/enums';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AnyAuthenticatedUser } from '../src/modules/auth/presentation/decorators.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordHasher } from '../src/modules/auth/application/password-hasher.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'a sufficiently long test passphrase';

/**
 * A route that exists only in tests. It is private (no @Public, no @AllowRestrictedSession), so it
 * exercises exactly what every future business route will get from the global guard. Real routes
 * cannot stand in for it yet: the only private routes today are the auth ones, which deliberately
 * allow restricted sessions.
 */
@Controller('test-probe')
class ProbeController {
  @Get()
  @AnyAuthenticatedUser()
  probe() {
    return { ok: true };
  }

  /** Deliberately declares no authorization: the guard must refuse it (fail closed). */
  @Get('unmarked')
  unmarked() {
    return { ok: true };
  }
}

export async function createApp(
  opts: { withProbe?: boolean } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: opts.withProbe ? [ProbeController] : [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${counter++}@autonova.test`;

export async function createUser(
  app: NestExpressApplication,
  opts: { roles?: string[]; status?: UserStatus; email?: string; password?: string | null } = {},
) {
  const prisma = app.get(PrismaService);
  const email = opts.email ?? uniqueEmail('user');
  const password = opts.password === undefined ? PASSWORD : opts.password;
  const passwordHash = password === null ? null : await app.get(PasswordHasher).hash(password);
  const roleRows = await prisma.role.findMany({
    where: { key: { in: opts.roles ?? [SystemRoleKey.BusinessDevelopment] } },
  });
  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'Test User',
      passwordHash,
      status: opts.status ?? UserStatus.Active,
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
    },
  });
  return { ...user, email, password: password ?? '' };
}

export async function login(app: NestExpressApplication, email: string, password = PASSWORD) {
  return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
}

export async function loginToken(app: NestExpressApplication, email: string, password = PASSWORD) {
  const res = await login(app, email, password);
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Logs in and marks the session MFA-verified, as the (not yet built) TOTP flow will. */
export async function loginVerifiedToken(
  app: NestExpressApplication,
  email: string,
  password = PASSWORD,
) {
  const token = await loginToken(app, email, password);
  const prisma = app.get(PrismaService);
  await prisma.session.updateMany({
    where: { user: { email }, mfaVerifiedAt: null },
    data: { mfaVerifiedAt: new Date() },
  });
  return token;
}

/** A Director whose session is already MFA-verified: the actor for administration tests. */
export async function createVerifiedDirector(app: NestExpressApplication) {
  const director = await createUser(app, { roles: [SystemRoleKey.Director] });
  const token = await loginVerifiedToken(app, director.email);
  return { director, token };
}
