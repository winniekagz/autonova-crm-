-- Migration: lead_capture_completion
-- Reason:     SOW 4.1 / PRD §4.1: constrain product interest to the Autonova catalogue, support
--             duplicate detection on normalised phone and company name, and persist next-action
--             reminders with delivery state.
-- Impact:     leads.product_interest changes from free text to the "ProductInterest" enum. Existing
--             text that exactly matches a catalogue key or label (ignoring case and punctuation) is
--             converted; anything else becomes NULL and the original text is kept in
--             legacy_product_interest, so no information is lost. Normalised phone/company columns
--             are backfilled with the same rules as domain/lead-duplicates.ts (non-ASCII letters may
--             normalise slightly differently in SQL; rows are re-keyed on their next edit).
-- Recovery:   Restore the pre-migration backup, or: cast product_interest back to TEXT using
--             COALESCE(legacy_product_interest, product_interest::text), drop lead_reminders, drop
--             the new columns/indexes and the three new enum types. Do not drop lead_reminders after
--             reminders were sent without exporting its delivery history first.
-- Hand-written constraints and data conversion are marked MANUAL.

CREATE TYPE "ProductInterest" AS ENUM (
  'RETAIL_POS', 'CAR_WASH_AUTOMATION', 'ERP', 'VISITOR_SECURITY_SYSTEM', 'HIRING_PLATFORM', 'CUSTOM_BUILD'
);
CREATE TYPE "LeadReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "LeadReminderReason" AS ENUM (
  'SMTP_NOT_CONFIGURED', 'DELIVERY_FAILED', 'LEAD_NOT_ACTIVE', 'FOLLOW_UP_CHANGED', 'RECIPIENT_UNAVAILABLE',
  'TOO_OVERDUE'
);

ALTER TABLE "leads"
  ADD COLUMN "legacy_product_interest" TEXT,
  ADD COLUMN "phone_normalized" TEXT,
  ADD COLUMN "company_name_normalized" TEXT;

-- MANUAL: keep the original text before the column is converted.
UPDATE "leads"
   SET "legacy_product_interest" = BTRIM("product_interest")
 WHERE NULLIF(BTRIM("product_interest"), '') IS NOT NULL;

-- MANUAL: convert only unambiguous catalogue matches; never guess.
ALTER TABLE "leads" ALTER COLUMN "product_interest" TYPE "ProductInterest" USING (
  CASE BTRIM(UPPER(REGEXP_REPLACE(COALESCE("product_interest", ''), '[^A-Za-z0-9]+', '_', 'g')), '_')
    WHEN 'RETAIL_POS' THEN 'RETAIL_POS'
    WHEN 'CAR_WASH_AUTOMATION' THEN 'CAR_WASH_AUTOMATION'
    WHEN 'ERP' THEN 'ERP'
    WHEN 'VISITOR_SECURITY_SYSTEM' THEN 'VISITOR_SECURITY_SYSTEM'
    WHEN 'HIRING_PLATFORM' THEN 'HIRING_PLATFORM'
    WHEN 'HIRING_PLATFORM_TALENTHUB' THEN 'HIRING_PLATFORM'
    WHEN 'CUSTOM_BUILD' THEN 'CUSTOM_BUILD'
    ELSE NULL
  END
)::"ProductInterest";

-- A matched row no longer needs a legacy copy.
UPDATE "leads" SET "legacy_product_interest" = NULL WHERE "product_interest" IS NOT NULL;

-- MANUAL: phone key = digits only, Kenyan numbers in international form without "+".
WITH raw AS (
  SELECT "id", BTRIM("phone") AS shown, REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS digits
    FROM "leads" WHERE "phone" IS NOT NULL
), keyed AS (
  SELECT "id", CASE
      WHEN shown LIKE '+%' THEN digits
      WHEN digits LIKE '00%' THEN SUBSTRING(digits FROM 3)
      WHEN digits LIKE '0%' THEN '254' || SUBSTRING(digits FROM 2)
      WHEN digits ~ '^[17][0-9]{8}$' THEN '254' || digits
      ELSE digits
    END AS key
    FROM raw
)
UPDATE "leads" l SET "phone_normalized" = keyed.key
  FROM keyed
 WHERE l."id" = keyed."id" AND LENGTH(keyed.key) BETWEEN 7 AND 15;

-- MANUAL: company key = lower-case words, punctuation removed, trailing legal suffix dropped.
UPDATE "leads" SET "company_name_normalized" = NULLIF(
  BTRIM(REGEXP_REPLACE(
    BTRIM(REGEXP_REPLACE(LOWER("company_name"), '[^[:alnum:]]+', ' ', 'g')),
    ' (limited|ltd|plc|inc|llc)$', '', 'g'
  )), '')
 WHERE "company_name" IS NOT NULL;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_phone_normalized_chk"
    CHECK ("phone_normalized" IS NULL OR "phone_normalized" ~ '^[0-9]{7,15}$'),
  ADD CONSTRAINT "leads_company_name_normalized_chk"
    CHECK ("company_name_normalized" IS NULL OR "company_name_normalized" = BTRIM("company_name_normalized"));

CREATE INDEX "leads_phone_normalized_idx" ON "leads"("phone_normalized");
CREATE INDEX "leads_company_name_normalized_idx" ON "leads"("company_name_normalized");

CREATE TABLE "lead_reminders" (
  "id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "LeadReminderStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_attempt_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "reason" "LeadReminderReason",
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "lead_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_reminders_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_reminders_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- MANUAL: one reminder per lead follow-up instant, however many workers run.
CREATE UNIQUE INDEX "lead_reminders_lead_id_due_at_key" ON "lead_reminders"("lead_id", "due_at");
CREATE INDEX "lead_reminders_status_next_attempt_at_idx" ON "lead_reminders"("status", "next_attempt_at");

-- MANUAL: delivery state must be self-consistent.
ALTER TABLE "lead_reminders"
  ADD CONSTRAINT "lead_reminders_attempts_chk" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "lead_reminders_sent_chk"
    CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL)),
  ADD CONSTRAINT "lead_reminders_sent_reason_chk"
    CHECK ("status" <> 'SENT' OR "reason" IS NULL),
  ADD CONSTRAINT "lead_reminders_terminal_reason_chk"
    CHECK ("status" NOT IN ('FAILED', 'SKIPPED') OR "reason" IS NOT NULL);

-- MANUAL: delivery records are evidence of what was (not) sent; the runtime may insert, read and
-- update their state, never delete them.
REVOKE DELETE, TRUNCATE ON "lead_reminders" FROM autonova_app;
