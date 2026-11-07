import pg from 'pg';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // rely on real environment variables
}

/**
 * Gives the least-privilege runtime role `autonova_app` (created by a migration as NOLOGIN)
 * the ability to sign in. Run as the owner after `db:migrate`; safe to repeat (rotates the password).
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const password = process.env.APP_DB_PASSWORD;
if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL is not set');
if (!password) throw new Error('APP_DB_PASSWORD is not set');
if (process.env.NODE_ENV === 'production' && password.length < 24) {
  throw new Error('APP_DB_PASSWORD must be at least 24 characters in production');
}

const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
try {
  // ALTER ROLE cannot take bind parameters, so the literal is quoted by the server.
  const { rows } = await client.query<{ stmt: string }>(
    `SELECT format('ALTER ROLE autonova_app LOGIN PASSWORD %L', $1::text) AS stmt`,
    [password],
  );
  const stmt = rows[0]?.stmt;
  if (!stmt) throw new Error('Could not build ALTER ROLE statement');
  await client.query(stmt);
  console.log('autonova_app can now sign in.');
} finally {
  await client.end();
}
