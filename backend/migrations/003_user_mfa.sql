-- =====================================================
-- MFA (Multi-Factor Authentication) support
-- Adds a user_mfa table for TOTP secrets and recovery codes
-- =====================================================

CREATE TABLE IF NOT EXISTS "user_mfa" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  "secret_encrypted" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "recovery_codes" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("user_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_mfa_user_id" ON "user_mfa" ("user_id");
