-- =====================================================
-- Open-source self-hosted auth: users table
-- Replaces the fluxez SDK's external user management.
-- =====================================================

CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255),
  "name" VARCHAR(255),
  "avatar_url" TEXT,
  "phone" VARCHAR(64),
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "email_verification_token" VARCHAR(255),
  "password_reset_token" VARCHAR(255),
  "password_reset_expires_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_banned" BOOLEAN NOT NULL DEFAULT false,
  "banned_reason" TEXT,
  "last_login_at" TIMESTAMPTZ,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "user_metadata" JSONB NOT NULL DEFAULT '{}',
  "oauth_provider" VARCHAR(64),
  "oauth_provider_id" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_email_verification_token" ON "users" ("email_verification_token");
CREATE INDEX IF NOT EXISTS "idx_users_password_reset_token" ON "users" ("password_reset_token");
CREATE INDEX IF NOT EXISTS "idx_users_oauth" ON "users" ("oauth_provider", "oauth_provider_id");
CREATE INDEX IF NOT EXISTS "idx_users_created_at" ON "users" ("created_at");

-- Refresh tokens table for JWT rotation
CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  "token_hash" VARCHAR(255) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "user_agent" TEXT,
  "ip_address" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id" ON "auth_refresh_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash" ON "auth_refresh_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires_at" ON "auth_refresh_tokens" ("expires_at");
