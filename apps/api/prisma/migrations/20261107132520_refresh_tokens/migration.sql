-- Migration: refresh_tokens
-- Reason:     Persistent sign-in. A short-lived access token is renewed with an opaque, rotating
--             refresh token held in an HttpOnly cookie. Only its SHA-256 hash is stored. A session is
--             its own token family: revoking the session revokes every token (docs/06 "Refresh-token
--             rotation and reuse detection").
-- Impact:     New table only; no existing data touched. Sessions that already exist have no refresh
--             token and simply cannot refresh (they end with their access token). Runtime role gets
--             DML via default privileges, which is what rotation (UPDATE used_at) needs.
-- Recovery:   DROP TABLE "refresh_tokens"; (nothing else depends on it). Users would have to sign in
--             again after every access-token expiry (15 minutes).
-- Hand-written sections are marked "MANUAL".

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MANUAL: the stored value is a SHA-256 hex digest, never a raw token.
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
-- MANUAL: a token expires after it was issued, and can only be used after it was issued.
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_expiry_after_creation_chk" CHECK ("expires_at" > "created_at");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_used_after_creation_chk" CHECK ("used_at" IS NULL OR "used_at" >= "created_at");
-- MANUAL: at most ONE unused (live) token per session. Rotation consumes the old token and inserts
-- its successor in one transaction, so the invariant holds at every commit; a code path that issued
-- a second live token would fail here instead of silently forking the token family.
CREATE UNIQUE INDEX "refresh_tokens_one_unused_per_session_key" ON "refresh_tokens"("session_id") WHERE "used_at" IS NULL;
