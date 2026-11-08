CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'INSTAGRAM', 'WEBSITE', 'WALK_IN', 'EVENT', 'COLD_OUTREACH', 'EXISTING_CLIENT_UPSELL');

CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "source" "LeadSource" NOT NULL,
    "referrer_name" TEXT,
    "product_interest" TEXT,
    "notes" TEXT,
    "estimated_value" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "stage" TEXT NOT NULL DEFAULT 'NEW_LEAD',
    "owner_user_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "next_action" TEXT NOT NULL,
    "next_action_at" TIMESTAMPTZ(3) NOT NULL,
    "probability" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leads_currency_check" CHECK ("currency" IN ('KES', 'USD')),
    CONSTRAINT "leads_value_check" CHECK ("estimated_value" IS NULL OR "estimated_value" >= 0),
    CONSTRAINT "leads_probability_check" CHECK ("probability" IS NULL OR "probability" BETWEEN 0 AND 100),
    CONSTRAINT "leads_referrer_check" CHECK ("source" <> 'REFERRAL' OR NULLIF(BTRIM("referrer_name"), '') IS NOT NULL),
    CONSTRAINT "leads_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "leads_owner_user_id_stage_updated_at_idx" ON "leads"("owner_user_id", "stage", "updated_at" DESC);
CREATE INDEX "leads_next_action_at_idx" ON "leads"("next_action_at");
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at" DESC);
