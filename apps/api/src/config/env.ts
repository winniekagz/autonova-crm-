import { z } from 'zod';

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/** Single definition of the API's environment. The process refuses to start if it is invalid. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), {
      message: 'must be a postgresql:// connection string',
    }),
  CORS_ORIGINS: csv.default(['http://localhost:3000']),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  SMTP_URL: z.url().optional(),
  MAIL_FROM: z.string().min(3).default('Autonova CRM <no-reply@localhost>'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters (openssl rand -base64 48)'),
  MFA_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must decode to 32 bytes'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(900).max(7_776_000).default(2_592_000),
  // A refresh token is replaced on every use, so this is also the idle timeout: a user who does not
  // return within this time must sign in again. Never longer than the session's absolute lifetime.
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(900).max(7_776_000).default(604_800),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // Argon2id cost. Benchmark on the deployment host (`pnpm --filter @autonova/api run bench:argon2`)
  // and aim for roughly 250-500 ms per hash. Hashes embed their parameters, so raising these later
  // is safe: old hashes still verify and are re-hashed on the next login.
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19456).max(1048576).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),
});

export type Env = z.infer<typeof envSchema>;

const PLACEHOLDER_SECRET = /change-me|changeme|example|secret/i;

/**
 * Cross-field production rules. Kept out of `envSchema` so that schema stays a plain object that
 * `@nestjs/config` and tests can use directly; `validateEnv` is what the application runs.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const env = envSchema.parse(raw);
  if (env.NODE_ENV === 'production') {
    if (PLACEHOLDER_SECRET.test(env.JWT_ACCESS_SECRET)) {
      throw new Error('JWT_ACCESS_SECRET looks like a placeholder; generate a real secret');
    }
    if (PLACEHOLDER_SECRET.test(env.MFA_ENCRYPTION_KEY)) {
      throw new Error('MFA_ENCRYPTION_KEY looks like a placeholder; generate a real secret');
    }
    if (env.CORS_ORIGINS.includes('*')) {
      throw new Error('CORS_ORIGINS must not contain * (credentials are enabled)');
    }
    if (!env.SMTP_URL) throw new Error('SMTP_URL is required in production');
  }
  return env;
}

/** Swagger is on outside production unless explicitly toggled; never on by accident in production. */
export function swaggerEnabled(env: Pick<Env, 'NODE_ENV' | 'SWAGGER_ENABLED'>): boolean {
  return env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production';
}
