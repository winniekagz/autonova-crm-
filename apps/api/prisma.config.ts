import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env itself. The single .env lives at the repository root.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // No .env file (CI/containers): rely on real environment variables.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations run as the owner role; the API runtime uses DATABASE_URL (autonova_app).
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
