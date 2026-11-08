-- Migration: companies_and_contacts
-- Reason:     PRD §4.2 / SOW 4.2: represent organisations and their people separately from deals, so one
--             company has many contacts and many leads and company data is not copied into each lead.
-- Impact:     Adds companies, contacts, lead_contacts and leads.company_id / primary_contact_id. Existing
--             leads keep their company_name text untouched. Every distinct normalised company name found on
--             leads becomes one company and those leads are linked to it. Groups whose original spellings
--             differ (for example "Acme Ltd" vs "Acme Limited") are linked but flagged needs_review = true
--             so a person can confirm or correct them; nothing is merged beyond the documented
--             normalisation (case, spacing, punctuation, one trailing legal suffix). Leads without a
--             company_name stay individual prospects (company_id NULL). Every created company is audited.
-- Recovery:   Restore the pre-migration backup, or: drop the three tables and the two lead columns
--             (leads.company_name was never modified), drop the CompanyIndustry type and the triggers and
--             functions created here. Do not drop after users have created contacts or edited companies
--             without exporting them first.
-- Hand-written constraints, triggers, grants and the data backfill are marked MANUAL.

CREATE TYPE "CompanyIndustry" AS ENUM (
  'RETAIL', 'HOSPITALITY', 'AUTOMOTIVE', 'MANUFACTURING', 'LOGISTICS', 'EDUCATION', 'HEALTHCARE',
  'FINANCE', 'AGRICULTURE', 'REAL_ESTATE', 'TECHNOLOGY', 'GOVERNMENT', 'OTHER'
);

CREATE TABLE "companies" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "name_normalized" TEXT NOT NULL,
  "kra_pin" TEXT,
  "location" TEXT,
  "industry" "CompanyIndustry",
  "staff_count" INTEGER,
  "branch_count" INTEGER,
  "website" TEXT,
  "social_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "archived_at" TIMESTAMPTZ(3),
  "archived_by_user_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "needs_review" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "companies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "companies_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "companies_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "contacts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "job_title" TEXT,
  "phone" TEXT,
  "phone_normalized" TEXT,
  "email" TEXT,
  "whatsapp_number" TEXT,
  "is_decision_maker" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contacts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contacts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "lead_contacts" (
  "lead_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_contacts_pkey" PRIMARY KEY ("lead_id", "contact_id"),
  CONSTRAINT "lead_contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "leads"
  ADD COLUMN "company_id" UUID,
  ADD COLUMN "primary_contact_id" UUID,
  ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "leads_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes follow the real queries: name search/duplicates, a BD's visible companies (creator or own
-- lead), a company's contacts, a company's leads per owner.
CREATE INDEX "companies_name_normalized_idx" ON "companies"("name_normalized");
CREATE INDEX "companies_created_by_user_id_idx" ON "companies"("created_by_user_id");
CREATE INDEX "contacts_company_id_archived_at_idx" ON "contacts"("company_id", "archived_at");
CREATE INDEX "lead_contacts_contact_id_idx" ON "lead_contacts"("contact_id");
CREATE INDEX "leads_company_id_owner_user_id_idx" ON "leads"("company_id", "owner_user_id");
CREATE INDEX "leads_primary_contact_id_idx" ON "leads"("primary_contact_id");

-- MANUAL: a KRA PIN identifies one live company. Archived companies release it.
CREATE UNIQUE INDEX "companies_kra_pin_active_key" ON "companies"("kra_pin")
  WHERE "kra_pin" IS NOT NULL AND "archived_at" IS NULL;

-- MANUAL: value rules (the API validates the same rules first and reports field-level messages).
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_name_chk" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND "name_normalized" <> ''),
  ADD CONSTRAINT "companies_kra_pin_chk" CHECK ("kra_pin" IS NULL OR "kra_pin" ~ '^[A-Z][0-9]{9}[A-Z]$'),
  ADD CONSTRAINT "companies_staff_count_chk" CHECK ("staff_count" IS NULL OR "staff_count" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "companies_branch_count_chk" CHECK ("branch_count" IS NULL OR "branch_count" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "companies_social_links_chk" CHECK (COALESCE(CARDINALITY("social_links"), 0) <= 10),
  ADD CONSTRAINT "companies_archive_chk" CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL));
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_name_chk" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  ADD CONSTRAINT "contacts_email_lower_chk" CHECK ("email" IS NULL OR "email" = LOWER("email"));
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_primary_contact_requires_company_chk"
    CHECK ("primary_contact_id" IS NULL OR "company_id" IS NOT NULL);

-- MANUAL: a contact belongs to one company for life, and a lead may only involve contacts of the
-- lead's own company. A plain foreign key cannot express this across two tables.
CREATE FUNCTION contacts_company_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."company_id" IS DISTINCT FROM OLD."company_id" THEN
    RAISE EXCEPTION 'contacts.company_id cannot change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contacts_company_immutable_trg BEFORE UPDATE OF "company_id" ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION contacts_company_immutable();

CREATE FUNCTION leads_contacts_match_company() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."primary_contact_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "contacts" c WHERE c."id" = NEW."primary_contact_id" AND c."company_id" = NEW."company_id"
  ) THEN
    RAISE EXCEPTION 'primary contact must belong to the lead company' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."company_id" IS DISTINCT FROM OLD."company_id" AND EXISTS (
    SELECT 1 FROM "lead_contacts" lc JOIN "contacts" c ON c."id" = lc."contact_id"
     WHERE lc."lead_id" = NEW."id" AND c."company_id" IS DISTINCT FROM NEW."company_id"
  ) THEN
    RAISE EXCEPTION 'lead contacts must belong to the lead company' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leads_contacts_match_company_trg BEFORE INSERT OR UPDATE OF "company_id", "primary_contact_id" ON "leads"
  FOR EACH ROW EXECUTE FUNCTION leads_contacts_match_company();

CREATE FUNCTION lead_contacts_match_company() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "leads" l JOIN "contacts" c ON c."company_id" = l."company_id"
     WHERE l."id" = NEW."lead_id" AND c."id" = NEW."contact_id"
  ) THEN
    RAISE EXCEPTION 'lead contact must belong to the lead company' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lead_contacts_match_company_trg BEFORE INSERT OR UPDATE ON "lead_contacts"
  FOR EACH ROW EXECUTE FUNCTION lead_contacts_match_company();

-- MANUAL: companies and contacts are archived, never deleted. The runtime role cannot delete them.
REVOKE DELETE, TRUNCATE ON "companies" FROM autonova_app;
REVOKE DELETE, TRUNCATE ON "contacts" FROM autonova_app;

-- MANUAL: backfill from the legacy free-text company name (leads.company_name is left untouched).
-- The key is leads.company_name_normalized, written by the previous migration and by the API.
WITH keyed AS (
  SELECT "id", "company_name", "company_name_normalized" AS key, "created_by_user_id", "created_at"
    FROM "leads"
   WHERE "company_name_normalized" IS NOT NULL
), grouped AS (
  SELECT key,
         (ARRAY_AGG(BTRIM("company_name") ORDER BY "created_at", "id"))[1] AS name,
         (ARRAY_AGG("created_by_user_id" ORDER BY "created_at", "id"))[1] AS created_by,
         COUNT(DISTINCT LOWER(REGEXP_REPLACE(BTRIM("company_name"), '\s+', ' ', 'g'))) > 1 AS spellings_differ
    FROM keyed GROUP BY key
)
INSERT INTO "companies" ("id", "name", "name_normalized", "created_by_user_id", "updated_by_user_id", "needs_review", "updated_at")
SELECT gen_random_uuid(), name, key, created_by, created_by, spellings_differ, CURRENT_TIMESTAMP FROM grouped;

UPDATE "leads" l SET "company_id" = c."id"
  FROM "companies" c
 WHERE l."company_name_normalized" IS NOT NULL AND c."name_normalized" = l."company_name_normalized";

INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "entity_type", "entity_id", "new_values", "reason")
SELECT gen_random_uuid(), NULL, 'company.created', 'company', c."id"::text,
       JSONB_BUILD_OBJECT('source', 'legacy_lead_company_text', 'leadsLinked', COALESCE(n.leads, 0), 'needsReview', c."needs_review"),
       'Created from existing lead company text during the companies migration'
  FROM "companies" c
  LEFT JOIN (SELECT "company_id", COUNT(*) AS leads FROM "leads" WHERE "company_id" IS NOT NULL GROUP BY "company_id") n
    ON n."company_id" = c."id";
