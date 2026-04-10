-- =====================================================
-- Open-source self-hosted auth: users table
-- Replaces the fluxez SDK's external user management.
--
-- Design notes:
--   - id is VARCHAR(255), not UUID, for direct compatibility with the
--     pre-existing schema (workspaces.owner_id, project_members.user_id,
--     etc. were all declared VARCHAR(255) referencing string SDK IDs).
--     Default value is a UUID rendered as text, so IDs are still globally
--     unique without breaking any existing FK column.
--   - email_confirmed_at is a TIMESTAMPTZ that mirrors email_verified.
--     This is the column name the admin/audit code already reads
--     (carried over from the original Supabase-style schema). Always
--     keep them in sync: when email_verified flips true, set
--     email_confirmed_at to now().
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255),
  "name" VARCHAR(255),
  "full_name" VARCHAR(255),
  "username" VARCHAR(255),
  "avatar_url" TEXT,
  "phone" VARCHAR(64),
  "role" VARCHAR(64) NOT NULL DEFAULT 'user',
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "email_confirmed_at" TIMESTAMPTZ,
  "email_verification_token" VARCHAR(255),
  "password_reset_token" VARCHAR(255),
  "password_reset_expires_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_banned" BOOLEAN NOT NULL DEFAULT false,
  "banned_reason" TEXT,
  "last_login_at" TIMESTAMPTZ,
  "last_sign_in_at" TIMESTAMPTZ,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "user_metadata" JSONB NOT NULL DEFAULT '{}',
  "oauth_provider" VARCHAR(64),
  "oauth_provider_id" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "idx_users_email_verification_token" ON "users" ("email_verification_token");
CREATE INDEX IF NOT EXISTS "idx_users_password_reset_token" ON "users" ("password_reset_token");
CREATE INDEX IF NOT EXISTS "idx_users_oauth" ON "users" ("oauth_provider", "oauth_provider_id");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role");
CREATE INDEX IF NOT EXISTS "idx_users_created_at" ON "users" ("created_at");

-- Refresh tokens table for JWT rotation. user_id is VARCHAR(255) to match
-- the users.id type (and the rest of the schema's user_id columns).
CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
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

-- Backwards-compatible view: some legacy queries reference auth.users
-- (the Supabase schema namespace). Expose the same table under that name
-- so existing code that runs raw SELECTs against auth.users keeps working.
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE OR REPLACE VIEW "auth"."users" AS SELECT * FROM public."users";
