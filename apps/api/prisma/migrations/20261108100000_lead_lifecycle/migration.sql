-- Migration: lead_lifecycle
-- Reason:     Constrain lead stages and persist lifecycle outcomes/history, including a durable
--             date-only revisit schedule. PRD §3.2–3.3 and §4.4; docs/flows/lead-management.md.
-- Impact:     Existing known active stages are cast to the enum. Unknown values and legacy Won,
--             Lost or Disqualified rows stop the migration for manual reconciliation; no history
--             or reason is fabricated. Existing New Lead rows remain New Lead.
-- Recovery:   Restore the pre-migration backup, then drop lead_stage_history, its indexes and
--             constraints; drop added lead columns; cast leads.stage back to TEXT; drop the new
--             enum types. Do not roll back after lifecycle events have been written without
--             exporting their history first.
-- Hand-written constraints and grants are marked MANUAL.

-- MANUAL: never silently coerce an unknown or terminal legacy state that has no retained reason,
-- signer evidence, or transition history. An operator must reconcile any such rows before retrying.
DO $$
DECLARE
  invalid_stages text;
BEGIN
  SELECT string_agg(stage_value, ', ')
    INTO invalid_stages
    FROM (
      SELECT DISTINCT stage AS stage_value
      FROM "leads"
      WHERE stage NOT IN (
        'NEW_LEAD', 'VISITS_AND_CALLS', 'QUALIFIED', 'SCOPE_ALIGNMENT',
        'TOR_QUOTE_SENT', 'DISQUALIFIED', 'WON', 'LOST'
      )
      UNION ALL
      SELECT DISTINCT stage
      FROM "leads"
      WHERE stage IN ('DISQUALIFIED', 'WON', 'LOST')
    ) AS invalid;

  IF invalid_stages IS NOT NULL THEN
    RAISE EXCEPTION 'lead_lifecycle migration stopped: reconcile legacy lead stages before migration: %', invalid_stages;
  END IF;
END
$$;

CREATE TYPE "LeadStage" AS ENUM (
  'NEW_LEAD', 'VISITS_AND_CALLS', 'QUALIFIED', 'SCOPE_ALIGNMENT',
  'TOR_QUOTE_SENT', 'DISQUALIFIED', 'WON', 'LOST'
);
CREATE TYPE "LeadDisqualificationReason" AS ENUM (
  'NO_BUDGET', 'NO_DECISION_MAKER', 'NEED_DOES_NOT_FIT', 'CHOSE_COMPETITOR',
  'UNRESPONSIVE', 'TIMING_REVISIT_LATER', 'OTHER'
);
CREATE TYPE "LeadTransitionSource" AS ENUM ('MANUAL', 'SCHEDULED_REVISIT');

ALTER TABLE "leads" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "leads" ALTER COLUMN "stage" TYPE "LeadStage" USING "stage"::"LeadStage";
ALTER TABLE "leads" ALTER COLUMN "stage" SET DEFAULT 'NEW_LEAD';
ALTER TABLE "leads"
  ADD COLUMN "lost_reason" TEXT,
  ADD COLUMN "lost_at" TIMESTAMPTZ(3),
  ADD COLUMN "lost_by_user_id" UUID,
  ADD COLUMN "disqualification_reason" "LeadDisqualificationReason",
  ADD COLUMN "disqualified_at" TIMESTAMPTZ(3),
  ADD COLUMN "disqualified_by_user_id" UUID,
  ADD COLUMN "revisit_on" DATE;

CREATE TABLE "lead_stage_history" (
  "id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "from_stage" "LeadStage",
  "to_stage" "LeadStage" NOT NULL,
  "actor_user_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  "disqualification_reason" "LeadDisqualificationReason",
  "revisit_on" DATE,
  "source" "LeadTransitionSource" NOT NULL DEFAULT 'MANUAL',
  CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_stage_history_different_stage_chk"
    CHECK ("from_stage" IS NULL OR "from_stage" <> "to_stage"),
  CONSTRAINT "lead_stage_history_revisit_chk"
    CHECK ("revisit_on" IS NULL OR "disqualification_reason" = 'TIMING_REVISIT_LATER'),
  CONSTRAINT "lead_stage_history_system_revisit_chk"
    CHECK ("source" <> 'SCHEDULED_REVISIT' OR (
      "from_stage" = 'DISQUALIFIED' AND "to_stage" = 'NEW_LEAD'
      AND "disqualification_reason" = 'TIMING_REVISIT_LATER' AND "revisit_on" IS NOT NULL
      AND "actor_user_id" IS NULL
    )),
  CONSTRAINT "lead_stage_history_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_stage_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "lead_stage_history_lead_id_occurred_at_idx"
  ON "lead_stage_history"("lead_id", "occurred_at" DESC);
CREATE INDEX "lead_stage_history_to_stage_disqualification_reason_occurred_at_idx"
  ON "lead_stage_history"("to_stage", "disqualification_reason", "occurred_at" DESC);
CREATE INDEX "lead_stage_history_to_stage_revisit_on_idx"
  ON "lead_stage_history"("to_stage", "revisit_on");
CREATE INDEX "leads_stage_revisit_on_idx" ON "leads"("stage", "revisit_on");

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_lost_fields_chk"
    CHECK (("stage" = 'LOST' AND "lost_reason" IS NOT NULL AND "lost_at" IS NOT NULL AND "lost_by_user_id" IS NOT NULL)
      OR ("stage" <> 'LOST' AND "lost_reason" IS NULL AND "lost_at" IS NULL AND "lost_by_user_id" IS NULL)),
  ADD CONSTRAINT "leads_lost_reason_nonempty_chk"
    CHECK ("lost_reason" IS NULL OR NULLIF(BTRIM("lost_reason"), '') IS NOT NULL),
  ADD CONSTRAINT "leads_disqualification_fields_chk"
    CHECK ("stage" <> 'DISQUALIFIED' OR ("disqualification_reason" IS NOT NULL AND "disqualified_at" IS NOT NULL AND "disqualified_by_user_id" IS NOT NULL)),
  ADD CONSTRAINT "leads_disqualification_revisit_date_chk"
    CHECK (("disqualification_reason" IS NULL AND "revisit_on" IS NULL)
      OR (("disqualification_reason" = 'TIMING_REVISIT_LATER') = ("revisit_on" IS NOT NULL))),
  ADD CONSTRAINT "leads_lost_by_user_id_fkey"
    FOREIGN KEY ("lost_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "leads_disqualified_by_user_id_fkey"
    FOREIGN KEY ("disqualified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL: transition history is domain history, not a mutable cache. Runtime may insert/read only.
REVOKE UPDATE, DELETE, TRUNCATE ON "lead_stage_history" FROM autonova_app;
