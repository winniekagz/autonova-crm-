-- Migration: activity_governance
-- Reason:     Owner decisions of 2026-11-08 for visit reports: Director-only archive with a recorded reason,
--             external attendees that can be linked to a CRM contact later without losing what was typed,
--             a voice-note recording notice, a configurable per-report attachment total, and reviewed
--             retention (12 months for GPS check-ins and voice notes) with legal holds.
-- Impact:     Adds columns to activities, activity_attendees and activity_attachments. Existing GPS check-ins
--             get gps_recorded_at = created_at (the best evidence of when they were captured). No row is
--             deleted. The attendee "contact or outside person" CHECK is replaced so a linked attendee can
--             keep the name it was recorded under. The attachment size ceiling rises from 25 MB to 100 MB,
--             the largest value the API setting accepts; the API enforces the configured limits. The
--             "archive needs a reason" rule is NOT VALID, so reports archived before it keep no reason and
--             every new archive must give one. Attachments of types that are no longer accepted (HEIC, OGG)
--             stay downloadable: nothing already stored is changed.
-- Recovery:   Restore the pre-migration backup, or drop the added columns and constraints and recreate
--             activity_attendees_one_kind_chk and the 25 MB activity_attachments_size_chk. Do not drop after
--             holds or purges were recorded without exporting them first.
-- Hand-written constraints, grants and data conversion are marked MANUAL.

ALTER TABLE "activities"
  ADD COLUMN "gps_recorded_at" TIMESTAMPTZ(3),
  ADD COLUMN "gps_cleared_at" TIMESTAMPTZ(3),
  ADD COLUMN "archived_reason" TEXT,
  ADD COLUMN "hold_reference" TEXT,
  ADD COLUMN "hold_reason" TEXT,
  ADD COLUMN "hold_placed_at" TIMESTAMPTZ(3),
  ADD COLUMN "hold_placed_by_user_id" UUID,
  ADD CONSTRAINT "activities_hold_placed_by_user_id_fkey"
    FOREIGN KEY ("hold_placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL: the retention clock for a check-in starts when it was captured; existing rows use their creation time.
UPDATE "activities" SET "gps_recorded_at" = "created_at" WHERE "latitude" IS NOT NULL;

ALTER TABLE "activities"
  -- a position always has a capture time, and a cleared position is gone
  ADD CONSTRAINT "activities_gps_recorded_chk" CHECK (("latitude" IS NULL) = ("gps_recorded_at" IS NULL)),
  ADD CONSTRAINT "activities_gps_cleared_chk" CHECK ("gps_cleared_at" IS NULL OR "latitude" IS NULL),
  -- a legal hold is complete or absent: reference, reason, who and when
  ADD CONSTRAINT "activities_hold_complete_chk" CHECK (
    ("hold_reference" IS NULL AND "hold_reason" IS NULL AND "hold_placed_at" IS NULL AND "hold_placed_by_user_id" IS NULL)
    OR (NULLIF(BTRIM("hold_reference"), '') IS NOT NULL AND NULLIF(BTRIM("hold_reason"), '') IS NOT NULL
        AND "hold_placed_at" IS NOT NULL AND "hold_placed_by_user_id" IS NOT NULL)),
  -- MANUAL: only reports archived from now on must carry a reason
  ADD CONSTRAINT "activities_archive_reason_chk" CHECK (
    "archived_at" IS NULL OR NULLIF(BTRIM("archived_reason"), '') IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "activities_archived_reason_cleared_chk" CHECK ("archived_at" IS NOT NULL OR "archived_reason" IS NULL);

-- Attendees: an outside attendee may be linked to a CRM contact later. The name and organisation as
-- first recorded are kept, so the history shows who was actually in the room.
ALTER TABLE "activity_attendees"
  ADD COLUMN "linked_at" TIMESTAMPTZ(3),
  ADD COLUMN "linked_by_user_id" UUID,
  ADD CONSTRAINT "activity_attendees_linked_by_user_id_fkey"
    FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_attendees" DROP CONSTRAINT "activity_attendees_one_kind_chk";
ALTER TABLE "activity_attendees"
  ADD CONSTRAINT "activity_attendees_kind_chk" CHECK (
    -- a CRM contact only
    ("contact_id" IS NOT NULL AND "external_name" IS NULL AND "organisation" IS NULL
       AND "linked_at" IS NULL AND "linked_by_user_id" IS NULL)
    -- an outside person, not linked
    OR ("contact_id" IS NULL AND NULLIF(BTRIM("external_name"), '') IS NOT NULL
       AND "linked_at" IS NULL AND "linked_by_user_id" IS NULL)
    -- an outside person later linked to a contact, keeping the name recorded
    OR ("contact_id" IS NOT NULL AND NULLIF(BTRIM("external_name"), '') IS NOT NULL
       AND "linked_at" IS NOT NULL AND "linked_by_user_id" IS NOT NULL));

-- Attachments: the voice-note notice, and the record that a stored file was purged.
ALTER TABLE "activity_attachments"
  ADD COLUMN "recording_notice_given" BOOLEAN,
  ADD COLUMN "archived_by_user_id" UUID,
  ADD COLUMN "archived_reason" TEXT,
  ADD COLUMN "purged_at" TIMESTAMPTZ(3),
  ADD COLUMN "purged_by_user_id" UUID,
  ADD COLUMN "purge_reason" TEXT,
  ADD COLUMN "purge_reference" TEXT,
  ADD CONSTRAINT "activity_attachments_archived_by_user_id_fkey"
    FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_attachments_purged_by_user_id_fkey"
    FOREIGN KEY ("purged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL: the API enforces the configured per-file limit; this is only a hard ceiling.
ALTER TABLE "activity_attachments" DROP CONSTRAINT "activity_attachments_size_chk";
ALTER TABLE "activity_attachments"
  ADD CONSTRAINT "activity_attachments_size_chk" CHECK ("size_bytes" > 0 AND "size_bytes" <= 104857600),
  -- a purge is complete or absent, and a purged file must already have been removed from the list
  ADD CONSTRAINT "activity_attachments_purge_chk" CHECK (
    ("purged_at" IS NULL AND "purged_by_user_id" IS NULL AND "purge_reason" IS NULL AND "purge_reference" IS NULL)
    OR ("purged_at" IS NOT NULL AND "purged_by_user_id" IS NOT NULL
        AND NULLIF(BTRIM("purge_reason"), '') IS NOT NULL AND NULLIF(BTRIM("purge_reference"), '') IS NOT NULL
        AND "archived_at" IS NOT NULL)),
  -- MANUAL: only attachments removed from now on must carry who and why; older ones keep neither
  ADD CONSTRAINT "activity_attachments_archive_reason_chk" CHECK (
    "archived_at" IS NULL OR NULLIF(BTRIM("archived_reason"), '') IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "activity_attachments_archive_cleared_chk" CHECK (
    "archived_at" IS NOT NULL OR ("archived_reason" IS NULL AND "archived_by_user_id" IS NULL)),
  -- MANUAL: only voice notes record whether participants were told they were being recorded
  ADD CONSTRAINT "activity_attachments_notice_chk" CHECK (
    "category" = 'VOICE_NOTE' OR "recording_notice_given" IS NULL);

-- MANUAL: retention scans voice notes by age and GPS by capture time. Both are small partial indexes.
CREATE INDEX "activity_attachments_voice_age_idx" ON "activity_attachments"("created_at")
  WHERE "category" = 'VOICE_NOTE' AND "purged_at" IS NULL;
CREATE INDEX "activities_gps_age_idx" ON "activities"("gps_recorded_at")
  WHERE "latitude" IS NOT NULL;
