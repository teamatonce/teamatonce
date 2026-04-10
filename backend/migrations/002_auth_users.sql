-- =====================================================
-- Open-source self-hosted auth: users table
-- Replaces the fluxez SDK's external user management.
--
-- Single-schema model:
--   The original fluxez was multi-tenant with one Postgres database per
--   tenant, each containing an `auth` schema with `auth.users`,
--   `auth.password_resets`, `auth.social_providers`, `auth.oauth_*`,
--   `auth.teams`, `auth.subscriptions`, etc. The open-source self-hosted
--   build collapses that into a single `public` schema (one database, one
--   tenant) — much simpler to operate. The `auth.users` view at the
--   bottom of this file keeps legacy raw SQL queries against
--   `auth.users` working unchanged.
--
-- Design notes:
--   - id is VARCHAR(255), not UUID, for direct compatibility with the
--     pre-existing schema (workspaces.owner_id, project_members.user_id,
--     etc. were all declared VARCHAR(255) referencing string SDK IDs).
--     Default value is a UUID rendered as text, so IDs are still globally
--     unique without breaking any existing FK column.
--   - Both `metadata`/`user_metadata` (new style) AND `raw_user_meta_data`/
--     `raw_app_meta_data` (legacy BaaS style) columns exist. Helpers
--     write to both pairs so legacy code that reads either name works.
--   - Both `is_banned`/`banned_reason` (boolean style) AND `banned_until`
--     (timestamp style) columns exist. banUser/unbanUser keep
--     them in sync.
--   - `email_confirmed_at` mirrors `email_verified` (timestamp vs bool).
--     verifyEmailFn sets both. Some legacy code reads the timestamp.
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
  -- Compat: timestamp form of is_banned. NULL = not banned;
  -- non-null = banned (timestamp marks when the ban was applied or
  -- when it expires; legacy code only checks for null/non-null).
  "banned_until" TIMESTAMPTZ,
  "last_login_at" TIMESTAMPTZ,
  "last_sign_in_at" TIMESTAMPTZ,
  -- Custom user-controlled metadata. `metadata` and `raw_user_meta_data`
  -- are kept in sync by the helper functions (auth-helpers.ts).
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "user_metadata" JSONB NOT NULL DEFAULT '{}',
  "raw_user_meta_data" JSONB NOT NULL DEFAULT '{}',
  -- App-controlled metadata (e.g. role, approval_status). Mirrored to
  -- `raw_app_meta_data` (legacy BaaS name) so both readers work.
  "app_metadata" JSONB NOT NULL DEFAULT '{}',
  "raw_app_meta_data" JSONB NOT NULL DEFAULT '{}',
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
-- (a separate `auth` schema namespace). Expose the same table under that name
-- so existing code that runs raw SELECTs against auth.users keeps working.
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE OR REPLACE VIEW "auth"."users" AS SELECT * FROM public."users";
