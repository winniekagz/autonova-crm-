import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // CI can provide the database URLs directly in the environment.
}

const testDatabaseUrl = (name: 'DATABASE_URL' | 'MIGRATION_DATABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run the API E2E suite`);
  const url = new URL(value);
  url.pathname = '/autonova_test';
  return url.toString();
};

// e2e/integration tests need a running PostgreSQL (`pnpm db:up`) with migrations applied.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: {
      API_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
      MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      DATABASE_URL: testDatabaseUrl('DATABASE_URL'),
      MIGRATION_DATABASE_URL: testDatabaseUrl('MIGRATION_DATABASE_URL'),
    },
    testTimeout: 20000,
  },
});
