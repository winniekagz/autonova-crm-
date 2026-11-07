import { describe, expect, it } from 'vitest';
import { envSchema, swaggerEnabled, validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('envSchema', () => {
  it('applies defaults', () => {
    const env = envSchema.parse(base);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('coerces the port and splits CORS origins', () => {
    const env = envSchema.parse({
      ...base,
      API_PORT: '8080',
      CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(env.API_PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('requires DATABASE_URL', () => {
    expect(envSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(envSchema.safeParse({ DATABASE_URL: 'mysql://x' }).success).toBe(false);
  });

  it('rejects an out-of-range port', () => {
    expect(envSchema.safeParse({ ...base, API_PORT: '70000' }).success).toBe(false);
  });

  it('requires a strong JWT secret', () => {
    expect(envSchema.safeParse({ ...base, JWT_ACCESS_SECRET: 'short' }).success).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL: base.DATABASE_URL }).success).toBe(false);
  });

  it('applies token and session defaults', () => {
    const env = envSchema.parse(base);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.SESSION_ABSOLUTE_TTL_SECONDS).toBe(2_592_000);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it('bounds the access-token lifetime', () => {
    expect(envSchema.safeParse({ ...base, ACCESS_TOKEN_TTL_SECONDS: '86400' }).success).toBe(false);
  });
});

describe('validateEnv (production rules)', () => {
  it('rejects a placeholder secret in production only', () => {
    const placeholder = { ...base, JWT_ACCESS_SECRET: 'change-me-'.padEnd(40, 'x') };
    expect(() => validateEnv({ ...placeholder, NODE_ENV: 'production' })).toThrow(/placeholder/);
    expect(() => validateEnv({ ...placeholder, NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejects wildcard CORS in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(
      /CORS/,
    );
  });
});

describe('swaggerEnabled', () => {
  it('is on in development, off in production, and overridable', () => {
    expect(swaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: undefined })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: undefined })).toBe(false);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: true })).toBe(true);
  });
});
