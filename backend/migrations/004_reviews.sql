-- =====================================================
-- Reviews & Public Reputation System Migration
-- Closes: GitHub issue #50
-- Generated: 2026-04-11
-- =====================================================

-- ==================== REVIEWS ====================
CREATE TABLE IF NOT EXISTS "reviews" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reviewer_id" VARCHAR(255) NOT NULL,
  "target_id" VARCHAR(255) NOT NULL,
  "project_id" UUID NOT NULL,
  "communication_rating" INTEGER NOT NULL CHECK ("communication_rating" BETWEEN 1 AND 5),
  "quality_rating" INTEGER NOT NULL CHECK ("quality_rating" BETWEEN 1 AND 5),
  "timeliness_rating" INTEGER NOT NULL CHECK ("timeliness_rating" BETWEEN 1 AND 5),
  "overall_rating" INTEGER NOT NULL CHECK ("overall_rating" BETWEEN 1 AND 5),
  "review_text" TEXT,
  "response_text" TEXT,
  "response_at" TIMESTAMPTZ,
  "is_reported" BOOLEAN DEFAULT false,
  "report_reason" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- One review per reviewer per target per project
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_unique_review"
  ON "reviews" ("reviewer_id", "target_id", "project_id");

CREATE INDEX IF NOT EXISTS "idx_reviews_reviewer_id" ON "reviews" ("reviewer_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_target_id" ON "reviews" ("target_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_project_id" ON "reviews" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_overall_rating" ON "reviews" ("overall_rating");
CREATE INDEX IF NOT EXISTS "idx_reviews_created_at" ON "reviews" ("created_at");
