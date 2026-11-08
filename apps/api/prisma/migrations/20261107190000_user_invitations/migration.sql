-- Single-use, expiring invitation credentials are stored as hashes, never plaintext tokens.
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");
CREATE INDEX "user_invitations_user_id_expires_at_idx" ON "user_invitations"("user_id", "expires_at");
