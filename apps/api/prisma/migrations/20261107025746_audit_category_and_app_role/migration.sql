-- Migration: audit_category_and_app_role
-- Reason:     (1) Security events (failed logins, token reuse) are not tied to a business
--             transaction, so audit rows get a category. (2) Triggers do not stop the table owner
--             or a superuser, so the runtime connects as a least-privilege role that can only
--             INSERT/SELECT audit_logs (docs/06-security-and-access-control.md, "Database enforcement").
-- Impact:     Adds a NOT NULL column with a default (existing rows become BUSINESS; safe, table is
--             tiny and rewritten instantly). Creates cluster-level role autonova_app (NOLOGIN until
--             `pnpm db:provision-app-role` sets a password). No existing data is changed.
-- Recovery:   DROP INDEX audit_logs_category_occurred_at_idx; ALTER TABLE audit_logs DROP COLUMN category;
--             DROP TYPE "AuditCategory"; REVOKE ALL ON ALL TABLES IN SCHEMA public FROM autonova_app;
--             ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM autonova_app;
--             DROP ROLE autonova_app (only after dropping dependent grants).
-- Hand-written sections are marked "MANUAL".

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('BUSINESS', 'SECURITY');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "category" "AuditCategory" NOT NULL DEFAULT 'BUSINESS';

-- CreateIndex
CREATE INDEX "audit_logs_category_occurred_at_idx" ON "audit_logs"("category", "occurred_at" DESC);

-- MANUAL: least-privilege runtime role. The owner/migrator role (the one running this migration)
-- owns every object and is used only for migrations; the API connects as autonova_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autonova_app') THEN
    CREATE ROLE autonova_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO autonova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO autonova_app;
-- Prisma's own bookkeeping table is not the application's business.
-- (Conditional: the shadow database used by `migrate dev` does not have the table.)
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM autonova_app;
  END IF;
END
$$;
-- Tables created by future migrations get the same DML grants automatically; each migration
-- that adds a table which must be restricted (e.g. immutable records) revokes explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autonova_app;

-- The audit log is append-only for the runtime role: INSERT and SELECT only. (TRUNCATE is never granted.)
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM autonova_app;
