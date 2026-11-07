-- Migration: session_mfa_verified_at
-- Reason:     Sessions of users whose roles require MFA are restricted until the second factor is
--             verified. The column records when that happened (NULL = not verified).
-- Impact:     Adds a nullable column; existing sessions become "MFA not verified", which is the safe
--             default (a Director session would be restricted). No data is rewritten.
-- Recovery:   ALTER TABLE "sessions" DROP COLUMN "mfa_verified_at";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "mfa_verified_at" TIMESTAMPTZ(3);
