-- Migration: activities_and_attachments
-- Reason:     SOW §4.3 / PRD §4.3: record every meeting, site visit, demo and call against a lead, with
--             attendees, structured notes, optional GPS check-in and file attachments (metadata only).
-- Impact:     Adds three tables and two enum types. No existing table is changed and no data is touched.
-- Recovery:   Restore the pre-migration backup, or drop activity_attachments, activity_attendees and
--             activities (in that order), their trigger functions and the two enum types. Do not drop after
--             users have recorded activities without exporting them (and purging blobs deliberately).
-- Hand-written constraints, triggers and grants are marked MANUAL.

CREATE TYPE "ActivityType" AS ENUM ('VISIT', 'CALL', 'DEMO', 'MEETING');
CREATE TYPE "AttachmentCategory" AS ENUM ('PHOTO', 'VOICE_NOTE', 'DOCUMENT');

CREATE TABLE "activities" (
  "id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "type" "ActivityType" NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "location" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "discussion" TEXT NOT NULL,
  "pain_points" TEXT,
  "current_tools" TEXT,
  "next_steps" TEXT,
  "archived_at" TIMESTAMPTZ(3),
  "archived_by_user_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "activities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "activities_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "activities_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "activity_attendees" (
  "id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "contact_id" UUID,
  "external_name" TEXT,
  "organisation" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_attendees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_attendees_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "activity_attendees_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "activity_attachments" (
  "id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "category" "AttachmentCategory" NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "activity_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes follow the queries: a lead's timeline newest first (keyset-stable), who recorded what, the
-- attendees and attachments of one activity, and "is this contact used" when archiving a contact.
CREATE INDEX "activities_lead_id_occurred_at_id_idx" ON "activities"("lead_id", "occurred_at" DESC, "id" DESC);
CREATE INDEX "activities_created_by_user_id_idx" ON "activities"("created_by_user_id");
CREATE INDEX "activity_attendees_activity_id_idx" ON "activity_attendees"("activity_id");
CREATE INDEX "activity_attendees_contact_id_idx" ON "activity_attendees"("contact_id");
CREATE UNIQUE INDEX "activity_attachments_storage_key_key" ON "activity_attachments"("storage_key");
CREATE INDEX "activity_attachments_activity_id_archived_at_idx" ON "activity_attachments"("activity_id", "archived_at");

-- MANUAL: value rules (the API validates the same rules first and reports field-level messages).
ALTER TABLE "activities"
  ADD CONSTRAINT "activities_discussion_chk" CHECK (NULLIF(BTRIM("discussion"), '') IS NOT NULL),
  ADD CONSTRAINT "activities_gps_pair_chk" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "activities_gps_range_chk" CHECK (
    ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90) AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)),
  ADD CONSTRAINT "activities_gps_visit_only_chk" CHECK ("latitude" IS NULL OR "type" = 'VISIT'),
  ADD CONSTRAINT "activities_archive_chk" CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL));
ALTER TABLE "activity_attendees"
  ADD CONSTRAINT "activity_attendees_one_kind_chk" CHECK (
    ("contact_id" IS NOT NULL AND "external_name" IS NULL AND "organisation" IS NULL)
    OR ("contact_id" IS NULL AND NULLIF(BTRIM("external_name"), '') IS NOT NULL));
ALTER TABLE "activity_attachments"
  ADD CONSTRAINT "activity_attachments_size_chk" CHECK ("size_bytes" > 0 AND "size_bytes" <= 26214400),
  ADD CONSTRAINT "activity_attachments_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "activity_attachments_name_chk" CHECK (NULLIF(BTRIM("file_name"), '') IS NOT NULL),
  ADD CONSTRAINT "activity_attachments_key_chk" CHECK ("storage_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- MANUAL: an activity never moves to another lead, and a contact attendee must belong to the company of
-- the activity's lead. A foreign key cannot express either across tables.
CREATE FUNCTION activities_lead_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."lead_id" IS DISTINCT FROM OLD."lead_id" THEN
    RAISE EXCEPTION 'activities.lead_id cannot change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activities_lead_immutable_trg BEFORE UPDATE OF "lead_id" ON "activities"
  FOR EACH ROW EXECUTE FUNCTION activities_lead_immutable();

CREATE FUNCTION activity_attendees_match_company() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."contact_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "activities" a
      JOIN "leads" l ON l."id" = a."lead_id"
      JOIN "contacts" c ON c."company_id" = l."company_id"
     WHERE a."id" = NEW."activity_id" AND c."id" = NEW."contact_id"
  ) THEN
    RAISE EXCEPTION 'attendee contact must belong to the lead company' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_attendees_match_company_trg BEFORE INSERT OR UPDATE ON "activity_attendees"
  FOR EACH ROW EXECUTE FUNCTION activity_attendees_match_company();

-- MANUAL: activities and attachment metadata are archived, never deleted. Attendees may be replaced when
-- a report is edited (the change is audited), so they keep DELETE.
REVOKE DELETE, TRUNCATE ON "activities" FROM autonova_app;
REVOKE DELETE, TRUNCATE ON "activity_attachments" FROM autonova_app;
