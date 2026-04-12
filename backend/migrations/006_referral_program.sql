-- =====================================================
-- Referral Program Migration
-- Closes: GitHub issue #56
-- Generated: 2026-04-11
-- =====================================================

-- ==================== REFERRAL CODES ====================
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "code" VARCHAR(20) NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_referral_codes_user_id" ON "referral_codes" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_codes_code" ON "referral_codes" ("code");

-- ==================== REFERRAL CLICKS ====================
CREATE TABLE IF NOT EXISTS "referral_clicks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(20) NOT NULL,
  "ip" VARCHAR(45) NOT NULL DEFAULT 'unknown',
  "user_agent" TEXT NOT NULL DEFAULT 'unknown',
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_referral_clicks_code" ON "referral_clicks" ("code");

-- ==================== REFERRALS ====================
CREATE TABLE IF NOT EXISTS "referrals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id" VARCHAR(255) NOT NULL,
  "referred_id" VARCHAR(255) NOT NULL,
  "referral_code" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'clicked' CHECK ("status" IN ('clicked', 'signed_up', 'converted')),
  "referrer_reward" NUMERIC(10, 2) DEFAULT 50.00,
  "referred_reward" NUMERIC(10, 2) DEFAULT 25.00,
  "converted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_referrals_referrer_id" ON "referrals" ("referrer_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_referred_id" ON "referrals" ("referred_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_referral_code" ON "referrals" ("referral_code");

-- ==================== REFERRAL CONFIG ====================
CREATE TABLE IF NOT EXISTS "referral_config" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(50) NOT NULL UNIQUE,
  "referrer_reward" NUMERIC(10, 2) DEFAULT 50.00,
  "referred_reward" NUMERIC(10, 2) DEFAULT 25.00,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- Insert default reward configuration
INSERT INTO "referral_config" ("id", "key", "referrer_reward", "referred_reward")
VALUES (gen_random_uuid(), 'rewards', 50.00, 25.00)
ON CONFLICT ("key") DO NOTHING;
