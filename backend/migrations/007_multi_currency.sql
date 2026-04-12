-- =====================================================
-- Multi-Currency Support Migration
-- Closes: GitHub issue #55
-- Generated: 2026-04-11
-- =====================================================

-- Add preferred_currency column to users table
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferred_currency" VARCHAR(3) DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS "idx_users_preferred_currency" ON "users" ("preferred_currency");
