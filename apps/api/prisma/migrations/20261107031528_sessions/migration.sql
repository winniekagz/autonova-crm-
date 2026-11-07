-- Migration: sessions
-- Reason:     Access tokens reference a server-side session so revocation, disablement and logout
--             take effect on the very next request (docs/06 "Access-token validation").
-- Impact:     New table only; no existing data touched. Runtime role gets DML via default privileges.
-- Recovery:   DROP TABLE "sessions"; (no other object depends on it yet; refresh_tokens will, in step 5).
-- Hand-written sections are marked "MANUAL".

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL: a session must expire after it was created.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expiry_after_creation_chk" CHECK ("expires_at" > "created_at");
-- MANUAL: a revocation reason only makes sense for a revoked session.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_reason_requires_revocation_chk" CHECK ("revoked_reason" IS NULL OR "revoked_at" IS NOT NULL);
