-- Encrypted TOTP credentials and hashed single-use recovery codes.
-- MFA secrets are encrypted by the API with MFA_ENCRYPTION_KEY; no plaintext secret is persisted.
CREATE TABLE "user_mfa" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT,
    "secret_iv" TEXT,
    "secret_tag" TEXT,
    "enrolled_at" TIMESTAMPTZ(3),
    "last_accepted_step" BIGINT,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_mfa_failed_attempts_check" CHECK ("failed_attempts" >= 0),
    CONSTRAINT "user_mfa_secret_fields_check" CHECK (
      ("secret_ciphertext" IS NULL AND "secret_iv" IS NULL AND "secret_tag" IS NULL)
      OR ("secret_ciphertext" IS NOT NULL AND "secret_iv" IS NOT NULL AND "secret_tag" IS NOT NULL)
    ),
    CONSTRAINT "user_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),
    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_mfa"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_used_at_idx" ON "mfa_recovery_codes"("user_id", "used_at");

-- New relations inherit runtime DML grants; recovery codes are only accessed by auth use cases.
