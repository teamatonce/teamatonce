-- =====================================================
-- Portfolio Showcase Migration
-- Closes: GitHub issue #51
-- Generated: 2026-04-11
-- =====================================================

-- ==================== PORTFOLIO ITEMS ====================
CREATE TABLE IF NOT EXISTS "portfolio_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(20) NOT NULL CHECK ("category" IN ('web-app', 'mobile-app', 'api', 'design', 'data', 'devops', 'other')),
  "tech_stack" JSONB DEFAULT '[]'::jsonb,
  "images" JSONB DEFAULT '[]'::jsonb,
  "live_demo_url" TEXT,
  "github_url" TEXT,
  "client_name" VARCHAR(200),
  "outcomes" TEXT,
  "start_date" DATE,
  "end_date" DATE,
  "is_featured" BOOLEAN DEFAULT false,
  "source" VARCHAR(20) DEFAULT 'manual' CHECK ("source" IN ('manual', 'github_import')),
  "github_repo_url" TEXT,
  "github_stars" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_portfolio_items_user_id" ON "portfolio_items" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_portfolio_items_category" ON "portfolio_items" ("category");
CREATE INDEX IF NOT EXISTS "idx_portfolio_items_is_featured" ON "portfolio_items" ("is_featured");
CREATE INDEX IF NOT EXISTS "idx_portfolio_items_source" ON "portfolio_items" ("source");
CREATE INDEX IF NOT EXISTS "idx_portfolio_items_created_at" ON "portfolio_items" ("created_at");

-- ==================== PORTFOLIO SNIPPETS ====================
CREATE TABLE IF NOT EXISTS "portfolio_snippets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "portfolio_item_id" UUID NOT NULL REFERENCES "portfolio_items" ("id") ON DELETE CASCADE,
  "language" VARCHAR(50) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_portfolio_snippets_item_id" ON "portfolio_snippets" ("portfolio_item_id");
