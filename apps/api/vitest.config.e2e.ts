import { defineConfig } from 'vitest/config';

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
    },
    testTimeout: 20000,
  },
});
