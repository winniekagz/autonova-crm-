import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { emailSchema, passwordSchema } from '@autonova/validation';
import { z } from 'zod';
import { AppModule } from '../app.module.js';
import {
  BootstrapDirectorUseCase,
  DirectorAlreadyExistsError,
  EmailAlreadyUsedError,
  RoleNotSeededError,
} from '../modules/auth/application/bootstrap-director.use-case.js';

/**
 * One-time creation of the first Director.
 *
 *   BOOTSTRAP_DIRECTOR_EMAIL=... BOOTSTRAP_DIRECTOR_NAME="..." BOOTSTRAP_DIRECTOR_PASSWORD=... \
 *     pnpm --filter @autonova/api run bootstrap:director
 *
 * Values come from the environment so the password never appears in shell history or `ps`
 * output as a CLI argument. Unset them afterwards.
 */
const inputSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});

const parsed = inputSchema.safeParse({
  email: process.env.BOOTSTRAP_DIRECTOR_EMAIL,
  fullName: process.env.BOOTSTRAP_DIRECTOR_NAME,
  password: process.env.BOOTSTRAP_DIRECTOR_PASSWORD,
});

if (!parsed.success) {
  console.error('Invalid bootstrap input:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  console.error(
    'Set BOOTSTRAP_DIRECTOR_EMAIL, BOOTSTRAP_DIRECTOR_NAME and BOOTSTRAP_DIRECTOR_PASSWORD.',
  );
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const { userId } = await app.get(BootstrapDirectorUseCase).execute(parsed.data);
  console.log(`First Director created (id ${userId}). They must enrol TOTP MFA at first login.`);
} catch (error) {
  if (
    error instanceof DirectorAlreadyExistsError ||
    error instanceof RoleNotSeededError ||
    error instanceof EmailAlreadyUsedError
  ) {
    console.error(`Refused: ${error.message}`);
    exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await app.close();
}
process.exit(exitCode);
