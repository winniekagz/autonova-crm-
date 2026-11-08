import { execFileSync } from 'node:child_process';
import pg from 'pg';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // rely on real environment variables
}

const TEST_DB = 'autonova_test';

/**
 * Recreates a throwaway database and applies every migration to it, so the e2e suite also
 * verifies that the migrations run from scratch. The dev database is never touched
 * (the audit log is append-only, so tests could not clean up after themselves there).
 */
export default async function setup(): Promise<void> {
  const ownerBase = process.env.MIGRATION_DATABASE_URL;
  const appBase = process.env.DATABASE_URL;
  if (!ownerBase || !appBase) {
    throw new Error('MIGRATION_DATABASE_URL and DATABASE_URL must be set (see .env.example)');
  }

  const admin = new URL(ownerBase);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await client.end();
  }

  // Migrations run as the owner; the code under test connects as the least-privilege app role.
  const ownerUrl = new URL(ownerBase);
  ownerUrl.pathname = `/${TEST_DB}`;
  process.env.MIGRATION_DATABASE_URL = ownerUrl.toString();
  const appUrl = new URL(appBase);
  appUrl.pathname = `/${TEST_DB}`;
  process.env.DATABASE_URL = appUrl.toString();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('..', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  });

  // The cluster-level role may not have a password on a fresh machine; make sure it can sign in.
  execFileSync('pnpm', ['run', 'db:provision-app-role'], {
    cwd: new URL('..', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  });

  // Same seed as a real install: the four system roles.
  execFileSync('pnpm', ['run', 'db:seed'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: ownerUrl.toString() },
    stdio: 'inherit',
  });
}
