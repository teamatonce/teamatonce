-- =====================================================
-- Deskive Database Schema - Initial Migration
-- Auto-generated from schema.ts
-- Generated: 2026-04-09T21:25:58.352Z
-- Tables: 59
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== PROJECTS ====================
CREATE TABLE IF NOT EXISTS "projects" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "project_type" VARCHAR(255) NOT NULL,
  "template_id" VARCHAR(255),
  "status" VARCHAR(255) NOT NULL DEFAULT 'planning',
  "requirements" JSONB DEFAULT '{}',
  "tech_stack" JSONB DEFAULT '[]',
  "frameworks" JSONB DEFAULT '[]',
  "features" JSONB DEFAULT '[]',
  "estimated_cost" TEXT,
  "budget_min" TEXT,
  "budget_max" TEXT,
  "actual_cost" TEXT DEFAULT 0,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "estimated_duration_days" INTEGER,
  "start_date" DATE,
  "expected_completion_date" DATE,
  "preferred_end_date" DATE,
  "actual_completion_date" DATE,
  "company_id" UUID,
  "assigned_company_id" UUID,
  "assigned_team" JSONB DEFAULT '[]',
  "team_lead_id" VARCHAR(255),
  "progress_percentage" TEXT DEFAULT 0,
  "current_milestone_id" UUID,
  "primary_objective" TEXT,
  "key_performance_indicators" JSONB DEFAULT '[]',
  "success_criteria" JSONB DEFAULT '[]',
  "settings" JSONB DEFAULT '{}',
  "metadata" JSONB DEFAULT '{}',
  "approval_status" VARCHAR(255) DEFAULT 'approved',
  "approval_reviewed_by" VARCHAR(255),
  "approval_reviewed_at" TIMESTAMPTZ,
  "approval_rejection_reason" TEXT,
  "is_public" BOOLEAN DEFAULT true,
  "force_closed_at" TIMESTAMPTZ,
  "force_closed_by" VARCHAR(255),
  "force_close_reason" TEXT,
  "awarded_at" TIMESTAMPTZ,
  "milestone_plan_approved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_projects_client_id" ON "projects" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_projects_company_id" ON "projects" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_projects_assigned_company_id" ON "projects" ("assigned_company_id");
CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "projects" ("status");
CREATE INDEX IF NOT EXISTS "idx_projects_project_type" ON "projects" ("project_type");
CREATE INDEX IF NOT EXISTS "idx_projects_team_lead_id" ON "projects" ("team_lead_id");
CREATE INDEX IF NOT EXISTS "idx_projects_created_at" ON "projects" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_projects_approval_status" ON "projects" ("approval_status");
CREATE INDEX IF NOT EXISTS "idx_projects_is_public" ON "projects" ("is_public");

-- ==================== PROJECT_PROPOSALS ====================
CREATE TABLE IF NOT EXISTS "project_proposals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "submitted_by" VARCHAR(255) NOT NULL,
  "cover_letter" TEXT,
  "proposed_cost" TEXT NOT NULL,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "proposed_duration_days" INTEGER NOT NULL,
  "proposed_start_date" DATE,
  "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "review_notes" TEXT,
  "proposed_milestones" JSONB DEFAULT '[]',
  "attachments" JSONB DEFAULT '[]',
  "team_composition" JSONB DEFAULT '[]',
  "similar_projects" JSONB DEFAULT '[]',
  "revision_count" INTEGER DEFAULT 0,
  "last_revision_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_project_proposals_project_id" ON "project_proposals" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_proposals_company_id" ON "project_proposals" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_project_proposals_submitted_by" ON "project_proposals" ("submitted_by");
CREATE INDEX IF NOT EXISTS "idx_project_proposals_status" ON "project_proposals" ("status");
CREATE INDEX IF NOT EXISTS "idx_project_proposals_created_at" ON "project_proposals" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_proposals_project_id_company_id" ON "project_proposals" ("project_id", "company_id");

-- ==================== HIRE_REQUESTS ====================
CREATE TABLE IF NOT EXISTS "hire_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" VARCHAR(255) NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(255) NOT NULL,
  "payment_type" VARCHAR(255) NOT NULL,
  "hourly_rate" TEXT,
  "estimated_hours" INTEGER,
  "fixed_budget" TEXT,
  "total_budget" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "duration" VARCHAR(255) NOT NULL,
  "additional_details" TEXT,
  "attachment_urls" JSONB DEFAULT '[]',
  "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
  "response_message" TEXT,
  "responded_at" TIMESTAMPTZ,
  "responded_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_hire_requests_client_id" ON "hire_requests" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_hire_requests_company_id" ON "hire_requests" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_hire_requests_status" ON "hire_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_hire_requests_created_at" ON "hire_requests" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_hire_requests_project_id" ON "hire_requests" ("project_id");

-- ==================== PROJECT_MILESTONES ====================
CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "milestone_type" VARCHAR(255) NOT NULL,
  "order_index" INTEGER NOT NULL,
  "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
  "deliverables" JSONB DEFAULT '[]',
  "acceptance_criteria" JSONB DEFAULT '[]',
  "estimated_hours" TEXT,
  "actual_hours" TEXT DEFAULT 0,
  "start_date" DATE,
  "due_date" DATE,
  "completed_date" DATE,
  "milestone_amount" TEXT,
  "payment_status" VARCHAR(255) DEFAULT 'pending',
  "payment_date" DATE,
  "requires_approval" BOOLEAN DEFAULT true,
  "approved_by" VARCHAR(255),
  "approved_at" TIMESTAMPTZ,
  "approval_notes" TEXT,
  "submitted_by" VARCHAR(255),
  "submitted_at" TIMESTAMPTZ,
  "submission_count" INTEGER DEFAULT 0,
  "feedback" TEXT,
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_project_milestones_project_id_order_index" ON "project_milestones" ("project_id", "order_index");
CREATE INDEX IF NOT EXISTS "idx_project_milestones_status" ON "project_milestones" ("status");
CREATE INDEX IF NOT EXISTS "idx_project_milestones_payment_status" ON "project_milestones" ("payment_status");

-- ==================== MILESTONE_PLANS ====================
CREATE TABLE IF NOT EXISTS "milestone_plans" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "submitted_by" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) NOT NULL DEFAULT 'draft',
  "milestones" JSONB NOT NULL DEFAULT '[]',
  "submitted_at" TIMESTAMPTZ,
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "client_feedback" TEXT,
  "revision_count" INTEGER DEFAULT 0,
  "version" INTEGER DEFAULT 1,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_milestone_plans_project_id" ON "milestone_plans" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_plans_proposal_id" ON "milestone_plans" ("proposal_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_plans_submitted_by" ON "milestone_plans" ("submitted_by");
CREATE INDEX IF NOT EXISTS "idx_milestone_plans_status" ON "milestone_plans" ("status");
CREATE INDEX IF NOT EXISTS "idx_milestone_plans_created_at" ON "milestone_plans" ("created_at");

-- ==================== MILESTONE_ADJUSTMENT_REQUESTS ====================
CREATE TABLE IF NOT EXISTS "milestone_adjustment_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "milestone_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "requested_by" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
  "changes" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "client_response" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_milestone_adjustment_requests_milestone_id" ON "milestone_adjustment_requests" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_adjustment_requests_project_id" ON "milestone_adjustment_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_adjustment_requests_requested_by" ON "milestone_adjustment_requests" ("requested_by");
CREATE INDEX IF NOT EXISTS "idx_milestone_adjustment_requests_status" ON "milestone_adjustment_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_milestone_adjustment_requests_created_at" ON "milestone_adjustment_requests" ("created_at");

-- ==================== PROJECT_TASKS ====================
CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "milestone_id" UUID,
  "parent_task_id" UUID,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "task_type" VARCHAR(255) NOT NULL,
  "priority" VARCHAR(255) DEFAULT 'medium',
  "status" VARCHAR(255) DEFAULT 'initialized',
  "assigned_to" VARCHAR(255),
  "assigned_by" VARCHAR(255),
  "assigned_at" TIMESTAMPTZ,
  "estimated_hours" TEXT,
  "actual_hours" TEXT DEFAULT 0,
  "due_date" DATE,
  "completed_date" DATE,
  "tags" JSONB DEFAULT '[]',
  "dependencies" JSONB DEFAULT '[]',
  "attachments" JSONB DEFAULT '[]',
  "checklist" JSONB DEFAULT '[]',
  "updated_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_project_tasks_project_id" ON "project_tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_milestone_id" ON "project_tasks" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_parent_task_id" ON "project_tasks" ("parent_task_id");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_assigned_to" ON "project_tasks" ("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_status" ON "project_tasks" ("status");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_priority" ON "project_tasks" ("priority");
CREATE INDEX IF NOT EXISTS "idx_project_tasks_updated_by" ON "project_tasks" ("updated_by");

-- ==================== PROJECT_FILES ====================
CREATE TABLE IF NOT EXISTS "project_files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "milestone_id" UUID,
  "file_name" VARCHAR(255) NOT NULL,
  "file_path" VARCHAR(255) NOT NULL,
  "file_url" VARCHAR(255) NOT NULL,
  "file_size" BIGINT NOT NULL,
  "mime_type" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(255) NOT NULL,
  "uploaded_by" VARCHAR(255) NOT NULL,
  "uploaded_at" TIMESTAMPTZ DEFAULT now(),
  "description" TEXT,
  "tags" JSONB DEFAULT '[]',
  "version" INTEGER DEFAULT 1,
  "is_deliverable" BOOLEAN DEFAULT false,
  "deliverable_index" INTEGER,
  "thumbnail_url" VARCHAR(255),
  "is_public" BOOLEAN DEFAULT false,
  "shared_with" JSONB DEFAULT '[]',
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_project_files_project_id" ON "project_files" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_files_milestone_id" ON "project_files" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_project_files_uploaded_by" ON "project_files" ("uploaded_by");
CREATE INDEX IF NOT EXISTS "idx_project_files_file_type" ON "project_files" ("file_type");
CREATE INDEX IF NOT EXISTS "idx_project_files_is_deliverable" ON "project_files" ("is_deliverable");
CREATE INDEX IF NOT EXISTS "idx_project_files_created_at" ON "project_files" ("created_at");

-- ==================== CONVERSATIONS ====================
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID,
  "conversation_type" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255),
  "participants" JSONB NOT NULL,
  "created_by" VARCHAR(255) NOT NULL,
  "last_message_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_conversations_project_id" ON "conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_created_by" ON "conversations" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_conversations_last_message_at" ON "conversations" ("last_message_at");

-- ==================== MESSAGES ====================
CREATE TABLE IF NOT EXISTS "messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "sender_id" VARCHAR(255) NOT NULL,
  "message_type" VARCHAR(255) DEFAULT 'text',
  "content" TEXT,
  "attachments" JSONB DEFAULT '[]',
  "mentions" JSONB DEFAULT '[]',
  "reply_to_id" UUID,
  "reactions" JSONB DEFAULT '{}',
  "read_by" JSONB DEFAULT '[]',
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id_created_at" ON "messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_messages_sender_id" ON "messages" ("sender_id");
CREATE INDEX IF NOT EXISTS "idx_messages_reply_to_id" ON "messages" ("reply_to_id");

-- ==================== VIDEO_SESSIONS ====================
CREATE TABLE IF NOT EXISTS "video_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "room_id" VARCHAR(255) NOT NULL,
  "room_name" VARCHAR(255) NOT NULL,
  "session_type" VARCHAR(255) DEFAULT 'meeting',
  "scheduled_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "duration_minutes" INTEGER,
  "host_id" VARCHAR(255) NOT NULL,
  "participants" JSONB DEFAULT '[]',
  "recording_url" VARCHAR(255),
  "recording_id" VARCHAR(255),
  "is_recording" BOOLEAN DEFAULT false,
  "meeting_notes" TEXT,
  "agenda" TEXT,
  "status" VARCHAR(255) DEFAULT 'scheduled',
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_video_sessions_project_id" ON "video_sessions" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_video_sessions_room_id" ON "video_sessions" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_video_sessions_host_id" ON "video_sessions" ("host_id");
CREATE INDEX IF NOT EXISTS "idx_video_sessions_status" ON "video_sessions" ("status");
CREATE INDEX IF NOT EXISTS "idx_video_sessions_scheduled_at" ON "video_sessions" ("scheduled_at");

-- ==================== VIDEO_SESSION_RECORDINGS ====================
CREATE TABLE IF NOT EXISTS "video_session_recordings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "video_session_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "database_recording_id" VARCHAR(255) NOT NULL,
  "recording_url" TEXT,
  "duration_seconds" INTEGER,
  "file_size_bytes" BIGINT,
  "status" VARCHAR(255) DEFAULT 'recording',
  "started_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "started_by" VARCHAR(255) NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_video_session_recordings_video_session_id" ON "video_session_recordings" ("video_session_id");
CREATE INDEX IF NOT EXISTS "idx_video_session_recordings_project_id" ON "video_session_recordings" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_video_session_recordings_status" ON "video_session_recordings" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_video_session_recordings_database_recording_id" ON "video_session_recordings" ("database_recording_id");
CREATE INDEX IF NOT EXISTS "idx_video_session_recordings_created_at" ON "video_session_recordings" ("created_at");

-- ==================== MEETINGS ====================
CREATE TABLE IF NOT EXISTS "meetings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "meeting_type" VARCHAR(255) NOT NULL,
  "location" VARCHAR(255),
  "start_time" TIMESTAMPTZ NOT NULL,
  "end_time" TIMESTAMPTZ NOT NULL,
  "attendees" JSONB DEFAULT '[]',
  "agenda" TEXT,
  "notes" TEXT,
  "recording_url" VARCHAR(255),
  "status" VARCHAR(255) DEFAULT 'scheduled',
  "created_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_meetings_project_id" ON "meetings" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_meetings_start_time" ON "meetings" ("start_time");
CREATE INDEX IF NOT EXISTS "idx_meetings_status" ON "meetings" ("status");
CREATE INDEX IF NOT EXISTS "idx_meetings_created_by" ON "meetings" ("created_by");

-- ==================== WHITEBOARD_SESSIONS ====================
CREATE TABLE IF NOT EXISTS "whiteboard_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "canvas_data" JSONB DEFAULT '{}',
  "created_by" VARCHAR(255) NOT NULL,
  "last_modified" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_whiteboard_sessions_project_id" ON "whiteboard_sessions" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_sessions_last_modified" ON "whiteboard_sessions" ("last_modified");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_sessions_created_by" ON "whiteboard_sessions" ("created_by");

-- ==================== CALENDAR_EVENTS ====================
CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "date" DATE NOT NULL,
  "start_time" VARCHAR(255) NOT NULL,
  "end_time" VARCHAR(255) NOT NULL,
  "type" VARCHAR(255) NOT NULL DEFAULT 'meeting',
  "meeting_url" TEXT,
  "priority" VARCHAR(255) DEFAULT 'normal',
  "status" VARCHAR(255) DEFAULT 'upcoming',
  "color" VARCHAR(255),
  "location" VARCHAR(255),
  "attendees" JSONB DEFAULT '[]',
  "reminder_minutes" INTEGER,
  "reminder_sent" BOOLEAN DEFAULT false,
  "created_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_calendar_events_project_id" ON "calendar_events" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_calendar_events_date" ON "calendar_events" ("date");
CREATE INDEX IF NOT EXISTS "idx_calendar_events_type" ON "calendar_events" ("type");
CREATE INDEX IF NOT EXISTS "idx_calendar_events_status" ON "calendar_events" ("status");
CREATE INDEX IF NOT EXISTS "idx_calendar_events_created_by" ON "calendar_events" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_calendar_events_reminder_sent" ON "calendar_events" ("reminder_sent");

-- ==================== CONTRACTS ====================
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "client_id" VARCHAR(255) NOT NULL,
  "contract_type" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) DEFAULT 'draft',
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "terms" TEXT NOT NULL,
  "scope_of_work" TEXT NOT NULL,
  "total_amount" TEXT NOT NULL,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "payment_terms" JSONB DEFAULT '{}',
  "hourly_rate" TEXT,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "renewal_terms" JSONB DEFAULT '{}',
  "client_signature" JSONB,
  "provider_signature" JSONB,
  "signed_at" TIMESTAMPTZ,
  "contract_document_url" VARCHAR(255),
  "attachments" JSONB DEFAULT '[]',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contracts_project_id" ON "contracts" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_client_id" ON "contracts" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_status" ON "contracts" ("status");
CREATE INDEX IF NOT EXISTS "idx_contracts_start_date" ON "contracts" ("start_date");

-- ==================== PAYMENTS ====================
CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "contract_id" UUID,
  "milestone_id" UUID,
  "client_id" VARCHAR(255) NOT NULL,
  "payment_type" VARCHAR(255) NOT NULL,
  "amount" TEXT NOT NULL,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "status" VARCHAR(255) DEFAULT 'pending',
  "payment_method" VARCHAR(255),
  "stripe_payment_intent_id" VARCHAR(255),
  "stripe_charge_id" VARCHAR(255),
  "transaction_id" VARCHAR(255),
  "transaction_date" TIMESTAMPTZ,
  "description" TEXT,
  "invoice_number" VARCHAR(255),
  "invoice_url" VARCHAR(255),
  "platform_fee" TEXT DEFAULT 0,
  "net_amount" TEXT,
  "escrow_status" VARCHAR(255),
  "escrow_hold_until" TIMESTAMPTZ,
  "escrow_released_at" TIMESTAMPTZ,
  "escrow_refunded_at" TIMESTAMPTZ,
  "stripe_connect_account_id" VARCHAR(255),
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payments_project_id" ON "payments" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_payments_contract_id" ON "payments" ("contract_id");
CREATE INDEX IF NOT EXISTS "idx_payments_milestone_id" ON "payments" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_payments_client_id" ON "payments" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_transaction_id" ON "payments" ("transaction_id");

-- ==================== MILESTONE_DELIVERABLES ====================
CREATE TABLE IF NOT EXISTS "milestone_deliverables" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "milestone_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "submitted_by" VARCHAR(255) NOT NULL,
  "submitted_at" TIMESTAMPTZ NOT NULL,
  "deliverable_files" JSONB DEFAULT '[]',
  "deliverable_description" TEXT,
  "deliverable_type" VARCHAR(255),
  "review_status" VARCHAR(255) DEFAULT 'pending',
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "review_notes" TEXT,
  "auto_approve_at" TIMESTAMPTZ,
  "auto_approved" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_milestone_deliverables_milestone_id" ON "milestone_deliverables" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_deliverables_project_id" ON "milestone_deliverables" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_milestone_deliverables_review_status" ON "milestone_deliverables" ("review_status");
CREATE INDEX IF NOT EXISTS "idx_milestone_deliverables_auto_approve_at" ON "milestone_deliverables" ("auto_approve_at");

-- ==================== PAYMENT_DISPUTES ====================
CREATE TABLE IF NOT EXISTS "payment_disputes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "milestone_id" UUID,
  "project_id" UUID NOT NULL,
  "dispute_reason" VARCHAR(255) NOT NULL,
  "dispute_description" TEXT NOT NULL,
  "disputed_by" VARCHAR(255) NOT NULL,
  "disputed_by_role" VARCHAR(255) NOT NULL,
  "dispute_amount" TEXT NOT NULL,
  "evidence_files" JSONB DEFAULT '[]',
  "evidence_description" TEXT,
  "response_text" TEXT,
  "response_files" JSONB DEFAULT '[]',
  "responded_by" VARCHAR(255),
  "responded_at" TIMESTAMPTZ,
  "mediator_id" VARCHAR(255),
  "mediation_notes" TEXT,
  "mediation_decision" VARCHAR(255),
  "mediation_percentage" TEXT,
  "mediated_at" TIMESTAMPTZ,
  "status" VARCHAR(255) DEFAULT 'open',
  "resolution" VARCHAR(255),
  "resolved_at" TIMESTAMPTZ,
  "resolution_notes" TEXT,
  "negotiation_deadline" TIMESTAMPTZ,
  "mediation_deadline" TIMESTAMPTZ,
  "response_deadline" TIMESTAMPTZ,
  "refund_amount" TEXT,
  "release_amount" TEXT,
  "refund_processed_at" TIMESTAMPTZ,
  "release_processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_payment_disputes_payment_id" ON "payment_disputes" ("payment_id");
CREATE INDEX IF NOT EXISTS "idx_payment_disputes_milestone_id" ON "payment_disputes" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_payment_disputes_project_id" ON "payment_disputes" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_payment_disputes_status" ON "payment_disputes" ("status");
CREATE INDEX IF NOT EXISTS "idx_payment_disputes_dispute_reason" ON "payment_disputes" ("dispute_reason");

-- ==================== ESCROW_TIMELINE_EVENTS ====================
CREATE TABLE IF NOT EXISTS "escrow_timeline_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "milestone_id" UUID,
  "dispute_id" UUID,
  "event_type" VARCHAR(255) NOT NULL,
  "event_description" TEXT NOT NULL,
  "event_data" JSONB DEFAULT '{}',
  "triggered_by" VARCHAR(255),
  "triggered_by_role" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_escrow_timeline_events_payment_id" ON "escrow_timeline_events" ("payment_id");
CREATE INDEX IF NOT EXISTS "idx_escrow_timeline_events_dispute_id" ON "escrow_timeline_events" ("dispute_id");
CREATE INDEX IF NOT EXISTS "idx_escrow_timeline_events_milestone_id" ON "escrow_timeline_events" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_escrow_timeline_events_event_type" ON "escrow_timeline_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_escrow_timeline_events_created_at" ON "escrow_timeline_events" ("created_at");

-- ==================== STRIPE_CONNECT_ACCOUNTS ====================
CREATE TABLE IF NOT EXISTS "stripe_connect_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "stripe_account_id" VARCHAR(255) NOT NULL,
  "account_type" VARCHAR(255) DEFAULT 'express',
  "business_type" VARCHAR(255) DEFAULT 'individual',
  "country" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "charges_enabled" BOOLEAN DEFAULT false,
  "payouts_enabled" BOOLEAN DEFAULT false,
  "is_onboarded" BOOLEAN DEFAULT false,
  "details_submitted" BOOLEAN DEFAULT false,
  "capabilities" JSONB DEFAULT '{}',
  "requirements" JSONB DEFAULT '{}',
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_stripe_connect_accounts_user_id" ON "stripe_connect_accounts" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stripe_connect_accounts_stripe_account_id" ON "stripe_connect_accounts" ("stripe_account_id");
CREATE INDEX IF NOT EXISTS "idx_stripe_connect_accounts_email" ON "stripe_connect_accounts" ("email");

-- ==================== SUPPORT_PACKAGES ====================
CREATE TABLE IF NOT EXISTS "support_packages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "client_id" VARCHAR(255) NOT NULL,
  "package_name" VARCHAR(255) NOT NULL,
  "package_type" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) DEFAULT 'active',
  "monthly_hours" INTEGER NOT NULL,
  "used_hours" TEXT DEFAULT 0,
  "response_time_sla" INTEGER,
  "includes_features" JSONB DEFAULT '[]',
  "monthly_cost" TEXT NOT NULL,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "renewal_date" DATE,
  "auto_renew" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_support_packages_project_id" ON "support_packages" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_support_packages_client_id" ON "support_packages" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_support_packages_status" ON "support_packages" ("status");

-- ==================== SUPPORT_TICKETS ====================
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "package_id" UUID,
  "client_id" VARCHAR(255) NOT NULL,
  "assigned_to" VARCHAR(255),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "ticket_type" VARCHAR(255) NOT NULL,
  "priority" VARCHAR(255) DEFAULT 'medium',
  "status" VARCHAR(255) DEFAULT 'open',
  "estimated_hours" TEXT,
  "actual_hours" TEXT DEFAULT 0,
  "response_time_minutes" INTEGER,
  "resolution_time_minutes" INTEGER,
  "reported_at" TIMESTAMPTZ DEFAULT now(),
  "responded_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "closed_at" TIMESTAMPTZ,
  "tags" JSONB DEFAULT '[]',
  "attachments" JSONB DEFAULT '[]',
  "resolution_notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_support_tickets_project_id" ON "support_tickets" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_package_id" ON "support_tickets" ("package_id");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_client_id" ON "support_tickets" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_assigned_to" ON "support_tickets" ("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_status" ON "support_tickets" ("status");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_priority" ON "support_tickets" ("priority");

-- ==================== TICKET_COMMENTS ====================
CREATE TABLE IF NOT EXISTS "ticket_comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL,
  "author_id" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "is_internal" BOOLEAN DEFAULT false,
  "attachments" JSONB DEFAULT '[]',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ticket_comments_ticket_id_created_at" ON "ticket_comments" ("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_ticket_comments_author_id" ON "ticket_comments" ("author_id");

-- ==================== DEVELOPER_COMPANIES ====================
CREATE TABLE IF NOT EXISTS "developer_companies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" VARCHAR(255) NOT NULL,
  "account_type" VARCHAR(255) NOT NULL,
  "company_name" VARCHAR(255),
  "display_name" VARCHAR(255) NOT NULL,
  "business_type" VARCHAR(255),
  "tax_id" VARCHAR(255),
  "company_size" VARCHAR(255),
  "website" VARCHAR(255),
  "description" TEXT,
  "logo_url" VARCHAR(255),
  "business_email" VARCHAR(255),
  "business_phone" VARCHAR(255),
  "business_address" JSONB DEFAULT '{}',
  "timezone" VARCHAR(255) DEFAULT 'UTC',
  "currency" VARCHAR(255) DEFAULT 'USD',
  "language" VARCHAR(255) DEFAULT 'en',
  "settings" JSONB DEFAULT '{}',
  "subscription_tier" VARCHAR(255) DEFAULT 'free',
  "subscription_status" VARCHAR(255) DEFAULT 'active',
  "stripe_customer_id" VARCHAR(255),
  "is_active" BOOLEAN DEFAULT true,
  "is_verified" BOOLEAN DEFAULT false,
  "verified_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "cover_image" VARCHAR(255),
  "professional_title" VARCHAR(255),
  "tagline" TEXT,
  "hourly_rate" TEXT DEFAULT 50,
  "availability" VARCHAR(255) DEFAULT 'available',
  "response_time" VARCHAR(255) DEFAULT 'within 24 hours',
  "profile_rating" TEXT DEFAULT 0,
  "total_reviews" INTEGER DEFAULT 0,
  "total_earnings" TEXT DEFAULT 0,
  "completed_projects" INTEGER DEFAULT 0,
  "success_rate" TEXT DEFAULT 100,
  "on_time_delivery" TEXT DEFAULT 100,
  "profile_skills" JSONB DEFAULT '[]',
  "profile_languages" JSONB DEFAULT '[]',
  "profile_education" JSONB DEFAULT '[]',
  "profile_certifications" JSONB DEFAULT '[]',
  "profile_experience" JSONB DEFAULT '[]',
  "profile_portfolio" JSONB DEFAULT '[]',
  "profile_social_links" JSONB DEFAULT '{}',
  "profile_verified" BOOLEAN DEFAULT false,
  "profile_top_rated" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_developer_companies_owner_id" ON "developer_companies" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_account_type" ON "developer_companies" ("account_type");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_is_active" ON "developer_companies" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_subscription_tier" ON "developer_companies" ("subscription_tier");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_created_at" ON "developer_companies" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_profile_rating" ON "developer_companies" ("profile_rating");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_profile_verified" ON "developer_companies" ("profile_verified");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_profile_top_rated" ON "developer_companies" ("profile_top_rated");
CREATE INDEX IF NOT EXISTS "idx_developer_companies_hourly_rate" ON "developer_companies" ("hourly_rate");

-- ==================== COMPANY_TEAM_MEMBERS ====================
CREATE TABLE IF NOT EXISTS "company_team_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "user_id" VARCHAR(255),
  "name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "avatar_url" VARCHAR(255),
  "title" VARCHAR(255),
  "bio" TEXT,
  "role" VARCHAR(255) NOT NULL,
  "permissions" JSONB DEFAULT '[]',
  "is_owner" BOOLEAN DEFAULT false,
  "skills" JSONB DEFAULT '[]',
  "specializations" JSONB DEFAULT '[]',
  "technologies" JSONB DEFAULT '[]',
  "expertise" JSONB DEFAULT '[]',
  "experience_years" INTEGER DEFAULT 0,
  "hourly_rate" TEXT,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "availability" VARCHAR(255) DEFAULT 'available',
  "status" VARCHAR(255) DEFAULT 'pending',
  "workload_percentage" TEXT DEFAULT 0,
  "capacity_hours_per_week" INTEGER DEFAULT 40,
  "current_projects" INTEGER DEFAULT 0,
  "current_project_ids" JSONB DEFAULT '[]',
  "hours_this_week" TEXT DEFAULT 0,
  "hours_this_month" TEXT DEFAULT 0,
  "phone" VARCHAR(255),
  "location" VARCHAR(255),
  "timezone" VARCHAR(255),
  "social_links" JSONB DEFAULT '{}',
  "rating" TEXT,
  "projects_completed" INTEGER DEFAULT 0,
  "total_hours_worked" TEXT DEFAULT 0,
  "on_time_delivery_rate" TEXT,
  "is_online" BOOLEAN DEFAULT false,
  "last_seen_at" TIMESTAMPTZ,
  "joined_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "activated_at" TIMESTAMPTZ,
  "deactivated_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_company_team_members_company_id_email" ON "company_team_members" ("company_id", "email");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_company_id" ON "company_team_members" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_user_id" ON "company_team_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_email" ON "company_team_members" ("email");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_role" ON "company_team_members" ("role");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_status" ON "company_team_members" ("status");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_availability" ON "company_team_members" ("availability");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_is_online" ON "company_team_members" ("is_online");
CREATE INDEX IF NOT EXISTS "idx_company_team_members_joined_date" ON "company_team_members" ("joined_date");

-- ==================== TEAM_INVITATIONS ====================
CREATE TABLE IF NOT EXISTS "team_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "invited_by" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "role" VARCHAR(255) NOT NULL,
  "message" TEXT,
  "initial_skills" JSONB DEFAULT '[]',
  "hourly_rate" TEXT,
  "initial_projects" JSONB DEFAULT '[]',
  "status" VARCHAR(255) DEFAULT 'pending',
  "token" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "declined_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "decline_reason" TEXT,
  "team_member_id" UUID,
  "sent_count" INTEGER DEFAULT 0,
  "last_sent_at" TIMESTAMPTZ,
  "opened_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_team_invitations_company_id_email" ON "team_invitations" ("company_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_invitations_token" ON "team_invitations" ("token");
CREATE INDEX IF NOT EXISTS "idx_team_invitations_status" ON "team_invitations" ("status");
CREATE INDEX IF NOT EXISTS "idx_team_invitations_expires_at" ON "team_invitations" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_team_invitations_email" ON "team_invitations" ("email");
CREATE INDEX IF NOT EXISTS "idx_team_invitations_invited_by" ON "team_invitations" ("invited_by");

-- ==================== TEAM_MEMBER_PROJECT_ASSIGNMENTS ====================
CREATE TABLE IF NOT EXISTS "team_member_project_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "team_member_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "project_role" VARCHAR(255) NOT NULL,
  "allocation_percentage" TEXT NOT NULL,
  "estimated_hours" TEXT,
  "assigned_at" TIMESTAMPTZ DEFAULT now(),
  "assigned_by" VARCHAR(255) NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "removed_at" TIMESTAMPTZ,
  "removed_by" VARCHAR(255),
  "actual_hours" TEXT DEFAULT 0,
  "billable_hours" TEXT DEFAULT 0,
  "tasks_assigned" INTEGER DEFAULT 0,
  "tasks_completed" INTEGER DEFAULT 0,
  "is_active" BOOLEAN DEFAULT true,
  "is_primary" BOOLEAN DEFAULT false,
  "status" VARCHAR(255) DEFAULT 'active',
  "project_permissions" JSONB DEFAULT '[]',
  "project_rating" TEXT,
  "feedback" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_company_id" ON "team_member_project_assignments" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_team_member_id" ON "team_member_project_assignments" ("team_member_id");
CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_project_id" ON "team_member_project_assignments" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_member_project_assignments_team_member_id_project_id" ON "team_member_project_assignments" ("team_member_id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_project_role" ON "team_member_project_assignments" ("project_role");
CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_is_active" ON "team_member_project_assignments" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_team_member_project_assignments_status" ON "team_member_project_assignments" ("status");

-- ==================== TEAM_MEMBERS ====================
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "role" VARCHAR(255) NOT NULL,
  "specialization" JSONB DEFAULT '[]',
  "skills" JSONB DEFAULT '[]',
  "technologies" JSONB DEFAULT '[]',
  "experience_years" INTEGER DEFAULT 0,
  "hourly_rate" TEXT,
  "currency" VARCHAR(255) DEFAULT 'USD',
  "availability_status" VARCHAR(255) DEFAULT 'available',
  "current_projects" JSONB DEFAULT '[]',
  "capacity_hours_per_week" INTEGER DEFAULT 40,
  "profile_image" VARCHAR(255),
  "bio" TEXT,
  "portfolio_url" VARCHAR(255),
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_members_user_id" ON "team_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_team_members_role" ON "team_members" ("role");
CREATE INDEX IF NOT EXISTS "idx_team_members_availability_status" ON "team_members" ("availability_status");
CREATE INDEX IF NOT EXISTS "idx_team_members_is_active" ON "team_members" ("is_active");

-- ==================== PROJECT_TEAM_ASSIGNMENTS ====================
CREATE TABLE IF NOT EXISTS "project_team_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "team_member_id" UUID NOT NULL,
  "project_role" VARCHAR(255) NOT NULL,
  "assigned_at" TIMESTAMPTZ DEFAULT now(),
  "removed_at" TIMESTAMPTZ,
  "allocation_percentage" INTEGER DEFAULT 100,
  "is_active" BOOLEAN DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_team_assignments_project_id_team_member_id" ON "project_team_assignments" ("project_id", "team_member_id");
CREATE INDEX IF NOT EXISTS "idx_project_team_assignments_team_member_id" ON "project_team_assignments" ("team_member_id");
CREATE INDEX IF NOT EXISTS "idx_project_team_assignments_is_active" ON "project_team_assignments" ("is_active");

-- ==================== PROJECT_MEMBERS ====================
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "user_id" VARCHAR(255) NOT NULL,
  "member_type" VARCHAR(255) NOT NULL,
  "company_id" UUID,
  "role" VARCHAR(255) NOT NULL,
  "permissions" JSONB DEFAULT '[]',
  "joined_at" TIMESTAMPTZ DEFAULT now(),
  "left_at" TIMESTAMPTZ,
  "is_active" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_members_project_id_user_id" ON "project_members" ("project_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_project_members_user_id" ON "project_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_project_members_project_id" ON "project_members" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_members_member_type" ON "project_members" ("member_type");
CREATE INDEX IF NOT EXISTS "idx_project_members_is_active" ON "project_members" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_project_members_company_id" ON "project_members" ("company_id");

-- ==================== PROJECT_TEMPLATES ====================
CREATE TABLE IF NOT EXISTS "project_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(255) NOT NULL,
  "subcategory" VARCHAR(255),
  "icon" VARCHAR(255),
  "thumbnail" VARCHAR(255),
  "default_tech_stack" JSONB DEFAULT '[]',
  "recommended_frameworks" JSONB DEFAULT '[]',
  "default_features" JSONB DEFAULT '[]',
  "default_milestones" JSONB DEFAULT '[]',
  "requirement_questions" JSONB DEFAULT '[]',
  "base_price" TEXT,
  "estimated_duration_days" INTEGER,
  "complexity_level" VARCHAR(255) DEFAULT 'medium',
  "is_active" BOOLEAN DEFAULT true,
  "usage_count" INTEGER DEFAULT 0,
  "rating" TEXT,
  "tags" JSONB DEFAULT '[]',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_templates_slug" ON "project_templates" ("slug");
CREATE INDEX IF NOT EXISTS "idx_project_templates_category" ON "project_templates" ("category");
CREATE INDEX IF NOT EXISTS "idx_project_templates_is_active" ON "project_templates" ("is_active");

-- ==================== PROJECT_FEEDBACK ====================
CREATE TABLE IF NOT EXISTS "project_feedback" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "milestone_id" UUID,
  "client_id" VARCHAR(255) NOT NULL,
  "feedback_type" VARCHAR(255) NOT NULL,
  "rating" INTEGER,
  "title" VARCHAR(255),
  "content" TEXT NOT NULL,
  "areas_of_improvement" JSONB DEFAULT '[]',
  "positive_aspects" JSONB DEFAULT '[]',
  "attachments" JSONB DEFAULT '[]',
  "is_public" BOOLEAN DEFAULT false,
  "response" TEXT,
  "responded_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_project_feedback_project_id" ON "project_feedback" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_feedback_milestone_id" ON "project_feedback" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_project_feedback_client_id" ON "project_feedback" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_project_feedback_feedback_type" ON "project_feedback" ("feedback_type");

-- ==================== PROJECT_REQUIREMENTS ====================
CREATE TABLE IF NOT EXISTS "project_requirements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "type" VARCHAR(255) NOT NULL,
  "priority" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_project_requirements_project_id" ON "project_requirements" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_requirements_type" ON "project_requirements" ("type");
CREATE INDEX IF NOT EXISTS "idx_project_requirements_priority" ON "project_requirements" ("priority");

-- ==================== PROJECT_STAKEHOLDERS ====================
CREATE TABLE IF NOT EXISTS "project_stakeholders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "role" VARCHAR(255) NOT NULL,
  "expected_outcome" TEXT NOT NULL,
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_project_stakeholders_project_id" ON "project_stakeholders" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_stakeholders_role" ON "project_stakeholders" ("role");

-- ==================== PROJECT_CONSTRAINTS ====================
CREATE TABLE IF NOT EXISTS "project_constraints" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "type" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "impact" TEXT,
  "mitigation_strategy" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_project_constraints_project_id" ON "project_constraints" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_constraints_type" ON "project_constraints" ("type");

-- ==================== NOTIFICATIONS ====================
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "notification_type" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "action_url" VARCHAR(255),
  "action_data" JSONB,
  "priority" VARCHAR(255) DEFAULT 'normal',
  "is_read" BOOLEAN DEFAULT false,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user_id_is_read" ON "notifications" ("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id_created_at" ON "notifications" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_notifications_notification_type" ON "notifications" ("notification_type");

-- ==================== SUBSCRIPTIONS ====================
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "user_id" VARCHAR(255) NOT NULL,
  "stripe_customer_id" VARCHAR(255),
  "stripe_subscription_id" VARCHAR(255),
  "price_id" VARCHAR(255),
  "plan_name" VARCHAR(255),
  "billing_interval" VARCHAR(255),
  "status" VARCHAR(255) DEFAULT 'active',
  "current_period_start" TIMESTAMPTZ,
  "current_period_end" TIMESTAMPTZ,
  "cancel_at_period_end" BOOLEAN DEFAULT false,
  "canceled_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "trial_start" TIMESTAMPTZ,
  "trial_end" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_subscriptions_company_id" ON "subscriptions" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_id" ON "subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_stripe_customer_id" ON "subscriptions" ("stripe_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscriptions_stripe_subscription_id" ON "subscriptions" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status" ON "subscriptions" ("status");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_plan_name" ON "subscriptions" ("plan_name");

-- ==================== PAYMENT_METHODS ====================
CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "user_id" VARCHAR(255) NOT NULL,
  "stripe_payment_method_id" VARCHAR(255) NOT NULL,
  "stripe_customer_id" VARCHAR(255),
  "type" VARCHAR(255) NOT NULL,
  "last4" VARCHAR(255),
  "brand" VARCHAR(255),
  "exp_month" INTEGER,
  "exp_year" INTEGER,
  "is_default" BOOLEAN DEFAULT false,
  "is_active" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_payment_methods_company_id" ON "payment_methods" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_payment_methods_user_id" ON "payment_methods" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_methods_stripe_payment_method_id" ON "payment_methods" ("stripe_payment_method_id");
CREATE INDEX IF NOT EXISTS "idx_payment_methods_stripe_customer_id" ON "payment_methods" ("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "idx_payment_methods_is_default" ON "payment_methods" ("is_default");

-- ==================== ACTIVITY_LOGS ====================
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "project_id" UUID,
  "activity_type" VARCHAR(255) NOT NULL,
  "entity_type" VARCHAR(255),
  "entity_id" UUID,
  "action" VARCHAR(255) NOT NULL,
  "changes" JSONB,
  "metadata" JSONB DEFAULT '{}',
  "ip_address" VARCHAR(255),
  "user_agent" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_activity_logs_user_id_created_at" ON "activity_logs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_project_id_created_at" ON "activity_logs" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_entity_type_entity_id" ON "activity_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_activity_type" ON "activity_logs" ("activity_type");

-- ==================== PROJECT_ANALYTICS ====================
CREATE TABLE IF NOT EXISTS "project_analytics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "hours_worked" TEXT DEFAULT 0,
  "tasks_completed" INTEGER DEFAULT 0,
  "messages_sent" INTEGER DEFAULT 0,
  "meetings_held" INTEGER DEFAULT 0,
  "active_team_members" INTEGER DEFAULT 0,
  "progress_delta" TEXT DEFAULT 0,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_analytics_project_id_date" ON "project_analytics" ("project_id", "date");
CREATE INDEX IF NOT EXISTS "idx_project_analytics_project_id" ON "project_analytics" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_analytics_date" ON "project_analytics" ("date");

-- ==================== NOTES ====================
CREATE TABLE IF NOT EXISTS "notes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT,
  "content_text" TEXT,
  "parent_id" UUID,
  "created_by" VARCHAR(255) NOT NULL,
  "last_edited_by" VARCHAR(255),
  "position" INTEGER DEFAULT 0,
  "icon" VARCHAR(255),
  "cover_image" VARCHAR(255),
  "tags" JSONB DEFAULT '[]',
  "attachments" JSONB DEFAULT '{}',
  "is_pinned" BOOLEAN DEFAULT false,
  "is_favorite" BOOLEAN DEFAULT false,
  "is_archived" BOOLEAN DEFAULT false,
  "archived_at" TIMESTAMPTZ,
  "shared_with" JSONB DEFAULT '[]',
  "view_count" INTEGER DEFAULT 0,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_notes_project_id" ON "notes" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_notes_parent_id" ON "notes" ("parent_id");
CREATE INDEX IF NOT EXISTS "idx_notes_created_by" ON "notes" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_notes_is_pinned" ON "notes" ("is_pinned");
CREATE INDEX IF NOT EXISTS "idx_notes_is_favorite" ON "notes" ("is_favorite");
CREATE INDEX IF NOT EXISTS "idx_notes_is_archived" ON "notes" ("is_archived");
CREATE INDEX IF NOT EXISTS "idx_notes_deleted_at" ON "notes" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_notes_project_id_position" ON "notes" ("project_id", "position");

-- ==================== HEALTH_METRICS ====================
CREATE TABLE IF NOT EXISTS "health_metrics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "metric_type" VARCHAR(255) NOT NULL,
  "value" TEXT,
  "unit" VARCHAR(255),
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_health_metrics_user_id" ON "health_metrics" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_health_metrics_metric_type" ON "health_metrics" ("metric_type");
CREATE INDEX IF NOT EXISTS "idx_health_metrics_user_id_metric_type" ON "health_metrics" ("user_id", "metric_type");

-- ==================== DEVICE_TOKENS ====================
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "device_type" VARCHAR(255) NOT NULL,
  "device_name" VARCHAR(255),
  "device_id" VARCHAR(255),
  "app_version" VARCHAR(255),
  "os_version" VARCHAR(255),
  "is_active" BOOLEAN DEFAULT true,
  "last_used_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_id" ON "device_tokens" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_device_tokens_token" ON "device_tokens" ("token");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_device_type" ON "device_tokens" ("device_type");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_is_active" ON "device_tokens" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_id_is_active" ON "device_tokens" ("user_id", "is_active");

-- ==================== FAQS ====================
CREATE TABLE IF NOT EXISTS "faqs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "category" VARCHAR(255),
  "order_index" INTEGER DEFAULT 0,
  "is_published" BOOLEAN DEFAULT true,
  "created_by" VARCHAR(255) NOT NULL,
  "updated_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_faqs_is_published" ON "faqs" ("is_published");
CREATE INDEX IF NOT EXISTS "idx_faqs_category" ON "faqs" ("category");
CREATE INDEX IF NOT EXISTS "idx_faqs_order_index" ON "faqs" ("order_index");
CREATE INDEX IF NOT EXISTS "idx_faqs_created_by" ON "faqs" ("created_by");

-- ==================== REPORTS ====================
CREATE TABLE IF NOT EXISTS "reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" VARCHAR(255) NOT NULL,
  "report_type" VARCHAR(255) NOT NULL,
  "target_id" VARCHAR(255) NOT NULL,
  "target_user_id" VARCHAR(255),
  "reason" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "evidence_urls" JSONB DEFAULT '[]',
  "status" VARCHAR(255) DEFAULT 'pending',
  "resolution" VARCHAR(255),
  "resolution_notes" TEXT,
  "reviewed_by" VARCHAR(255),
  "reviewed_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_reports_reporter_id" ON "reports" ("reporter_id");
CREATE INDEX IF NOT EXISTS "idx_reports_target_id" ON "reports" ("target_id");
CREATE INDEX IF NOT EXISTS "idx_reports_target_user_id" ON "reports" ("target_user_id");
CREATE INDEX IF NOT EXISTS "idx_reports_report_type" ON "reports" ("report_type");
CREATE INDEX IF NOT EXISTS "idx_reports_status" ON "reports" ("status");
CREATE INDEX IF NOT EXISTS "idx_reports_reason" ON "reports" ("reason");
CREATE INDEX IF NOT EXISTS "idx_reports_created_at" ON "reports" ("created_at");

-- ==================== EMAIL_CAMPAIGNS ====================
CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "subject" VARCHAR(255) NOT NULL,
  "content_html" TEXT NOT NULL,
  "content_text" TEXT,
  "target_audience" VARCHAR(255) NOT NULL,
  "target_filters" JSONB DEFAULT '{}',
  "status" VARCHAR(255) DEFAULT 'draft',
  "scheduled_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "total_recipients" INTEGER DEFAULT 0,
  "sent_count" INTEGER DEFAULT 0,
  "failed_count" INTEGER DEFAULT 0,
  "created_by" VARCHAR(255) NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_email_campaigns_status" ON "email_campaigns" ("status");
CREATE INDEX IF NOT EXISTS "idx_email_campaigns_target_audience" ON "email_campaigns" ("target_audience");
CREATE INDEX IF NOT EXISTS "idx_email_campaigns_scheduled_at" ON "email_campaigns" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_email_campaigns_created_by" ON "email_campaigns" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_email_campaigns_created_at" ON "email_campaigns" ("created_at");

-- ==================== CRAWLED_DATA ====================
CREATE TABLE IF NOT EXISTS "crawled_data" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" VARCHAR(255) NOT NULL,
  "type" VARCHAR(255) NOT NULL,
  "source_url" VARCHAR(255) NOT NULL,
  "source_id" VARCHAR(255),
  "raw_data" JSONB NOT NULL,
  "crawled_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_crawled_data_source_type" ON "crawled_data" ("source", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_crawled_data_source_url" ON "crawled_data" ("source_url");
CREATE INDEX IF NOT EXISTS "idx_crawled_data_crawled_at" ON "crawled_data" ("crawled_at");

-- ==================== CRAWL_JOBS ====================
CREATE TABLE IF NOT EXISTS "crawl_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) DEFAULT 'pending',
  "params" JSONB,
  "items_found" INTEGER DEFAULT 0,
  "items_new" INTEGER DEFAULT 0,
  "items_skipped" INTEGER DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_crawl_jobs_source_status" ON "crawl_jobs" ("source", "status");
CREATE INDEX IF NOT EXISTS "idx_crawl_jobs_created_at" ON "crawl_jobs" ("created_at");

-- ==================== ENRICHED_PROFILES ====================
CREATE TABLE IF NOT EXISTS "enriched_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "crawled_data_id" UUID NOT NULL,
  "source" VARCHAR(255) NOT NULL,
  "type" VARCHAR(255) NOT NULL,
  "structured_data" JSONB NOT NULL,
  "summary" TEXT,
  "embedding_id" VARCHAR(255),
  "unified_entity_id" UUID,
  "enriched_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_enriched_profiles_crawled_data_id" ON "enriched_profiles" ("crawled_data_id");
CREATE INDEX IF NOT EXISTS "idx_enriched_profiles_source_type" ON "enriched_profiles" ("source", "type");
CREATE INDEX IF NOT EXISTS "idx_enriched_profiles_enriched_at" ON "enriched_profiles" ("enriched_at");
CREATE INDEX IF NOT EXISTS "idx_enriched_profiles_unified_entity_id" ON "enriched_profiles" ("unified_entity_id");

-- ==================== UNIFIED_ENTITIES ====================
CREATE TABLE IF NOT EXISTS "unified_entities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" VARCHAR(255) NOT NULL,
  "canonical_name" VARCHAR(255) NOT NULL,
  "normalized_email" VARCHAR(255),
  "normalized_github" VARCHAR(255),
  "normalized_twitter" VARCHAR(255),
  "normalized_linkedin" VARCHAR(255),
  "location" VARCHAR(255),
  "company" VARCHAR(255),
  "merged_data" JSONB DEFAULT '{}',
  "source_count" INTEGER DEFAULT 1,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_unified_entities_entity_type" ON "unified_entities" ("entity_type");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unified_entities_normalized_email" ON "unified_entities" ("normalized_email");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unified_entities_normalized_github" ON "unified_entities" ("normalized_github");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unified_entities_normalized_twitter" ON "unified_entities" ("normalized_twitter");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unified_entities_normalized_linkedin" ON "unified_entities" ("normalized_linkedin");
CREATE INDEX IF NOT EXISTS "idx_unified_entities_canonical_name" ON "unified_entities" ("canonical_name");
CREATE INDEX IF NOT EXISTS "idx_unified_entities_source_count" ON "unified_entities" ("source_count");
CREATE INDEX IF NOT EXISTS "idx_unified_entities_created_at" ON "unified_entities" ("created_at");

-- ==================== ENTITY_SOURCE_LINKS ====================
CREATE TABLE IF NOT EXISTS "entity_source_links" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "unified_entity_id" UUID NOT NULL,
  "enriched_profile_id" UUID NOT NULL,
  "match_type" VARCHAR(255) NOT NULL,
  "confidence_score" TEXT NOT NULL,
  "linked_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_entity_source_links_unified_entity_id" ON "entity_source_links" ("unified_entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_entity_source_links_enriched_profile_id" ON "entity_source_links" ("enriched_profile_id");
CREATE INDEX IF NOT EXISTS "idx_entity_source_links_match_type" ON "entity_source_links" ("match_type");
CREATE INDEX IF NOT EXISTS "idx_entity_source_links_confidence_score" ON "entity_source_links" ("confidence_score");

-- ==================== ENTITY_SCORES ====================
CREATE TABLE IF NOT EXISTS "entity_scores" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "unified_entity_id" UUID NOT NULL,
  "completeness_score" TEXT DEFAULT 0,
  "activity_score" TEXT DEFAULT 0,
  "availability_score" TEXT DEFAULT 0,
  "quality_score" TEXT DEFAULT 0,
  "score_breakdown" JSONB DEFAULT '{}',
  "scored_at" TIMESTAMPTZ DEFAULT now(),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_entity_scores_unified_entity_id" ON "entity_scores" ("unified_entity_id");
CREATE INDEX IF NOT EXISTS "idx_entity_scores_quality_score" ON "entity_scores" ("quality_score");
CREATE INDEX IF NOT EXISTS "idx_entity_scores_completeness_score" ON "entity_scores" ("completeness_score");
CREATE INDEX IF NOT EXISTS "idx_entity_scores_activity_score" ON "entity_scores" ("activity_score");
CREATE INDEX IF NOT EXISTS "idx_entity_scores_availability_score" ON "entity_scores" ("availability_score");
CREATE INDEX IF NOT EXISTS "idx_entity_scores_scored_at" ON "entity_scores" ("scored_at");

-- ==================== MATCH_RESULTS ====================
CREATE TABLE IF NOT EXISTS "match_results" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_enriched_profile_id" UUID NOT NULL,
  "developer_entity_id" UUID NOT NULL,
  "vector_similarity" TEXT DEFAULT 0,
  "rule_score" TEXT DEFAULT 0,
  "composite_score" TEXT DEFAULT 0,
  "match_breakdown" JSONB DEFAULT '{}',
  "status" VARCHAR(255) DEFAULT 'active',
  "matched_at" TIMESTAMPTZ DEFAULT now(),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_match_results_job_enriched_profile_id" ON "match_results" ("job_enriched_profile_id");
CREATE INDEX IF NOT EXISTS "idx_match_results_developer_entity_id" ON "match_results" ("developer_entity_id");
CREATE INDEX IF NOT EXISTS "idx_match_results_composite_score" ON "match_results" ("composite_score");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_match_results_job_enriched_profile_id_developer_entity_id" ON "match_results" ("job_enriched_profile_id", "developer_entity_id");
CREATE INDEX IF NOT EXISTS "idx_match_results_status" ON "match_results" ("status");

-- ==================== PIPELINE_RUNS ====================
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" VARCHAR(255) DEFAULT 'pending',
  "config" JSONB DEFAULT '{}',
  "profiles_scanned" INTEGER DEFAULT 0,
  "urls_discovered" INTEGER DEFAULT 0,
  "urls_already_crawled" INTEGER DEFAULT 0,
  "urls_new" INTEGER DEFAULT 0,
  "items_crawled" INTEGER DEFAULT 0,
  "items_enriched" INTEGER DEFAULT 0,
  "items_failed" INTEGER DEFAULT 0,
  "discovered_urls" JSONB DEFAULT '[]',
  "error_message" TEXT,
  "auto_enrich" BOOLEAN DEFAULT true,
  "pipeline_type" VARCHAR(255) DEFAULT 'chain',
  "current_stage" VARCHAR(255) DEFAULT 'pending',
  "stage_data" JSONB DEFAULT '{}',
  "items_to_enrich" INTEGER DEFAULT 0,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_status" ON "pipeline_runs" ("status");
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_pipeline_type" ON "pipeline_runs" ("pipeline_type");
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_created_at" ON "pipeline_runs" ("created_at");

-- ==================== OUTREACH_CAMPAIGNS ====================
CREATE TABLE IF NOT EXISTS "outreach_campaigns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "template_subject" VARCHAR(255) NOT NULL,
  "template_html" TEXT NOT NULL,
  "template_text" TEXT,
  "from_address" VARCHAR(255),
  "from_name" VARCHAR(255),
  "reply_to" VARCHAR(255),
  "target_filters" JSONB DEFAULT '{}',
  "status" VARCHAR(255) DEFAULT 'draft',
  "total_recipients" INTEGER DEFAULT 0,
  "sent_count" INTEGER DEFAULT 0,
  "opened_count" INTEGER DEFAULT 0,
  "clicked_count" INTEGER DEFAULT 0,
  "unsubscribed_count" INTEGER DEFAULT 0,
  "bounced_count" INTEGER DEFAULT 0,
  "created_by" VARCHAR(255),
  "scheduled_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_outreach_campaigns_status" ON "outreach_campaigns" ("status");
CREATE INDEX IF NOT EXISTS "idx_outreach_campaigns_created_by" ON "outreach_campaigns" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_outreach_campaigns_created_at" ON "outreach_campaigns" ("created_at");

-- ==================== OUTREACH_RECIPIENTS ====================
CREATE TABLE IF NOT EXISTS "outreach_recipients" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "unified_entity_id" UUID,
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "personalization_data" JSONB DEFAULT '{}',
  "tracking_token" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) DEFAULT 'pending',
  "sent_at" TIMESTAMPTZ,
  "opened_at" TIMESTAMPTZ,
  "clicked_at" TIMESTAMPTZ,
  "bounced_at" TIMESTAMPTZ,
  "unsubscribed_at" TIMESTAMPTZ,
  "error_message" VARCHAR(255),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_outreach_recipients_campaign_id" ON "outreach_recipients" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_recipients_unified_entity_id" ON "outreach_recipients" ("unified_entity_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_recipients_email" ON "outreach_recipients" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_outreach_recipients_tracking_token" ON "outreach_recipients" ("tracking_token");
CREATE INDEX IF NOT EXISTS "idx_outreach_recipients_status" ON "outreach_recipients" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_outreach_recipients_campaign_id_email" ON "outreach_recipients" ("campaign_id", "email");

-- ==================== OUTREACH_EVENTS ====================
CREATE TABLE IF NOT EXISTS "outreach_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "event_type" VARCHAR(255) NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_outreach_events_recipient_id" ON "outreach_events" ("recipient_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_events_campaign_id" ON "outreach_events" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_events_event_type" ON "outreach_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_outreach_events_created_at" ON "outreach_events" ("created_at");

-- ==================== EMAIL_BLOCKLIST ====================
CREATE TABLE IF NOT EXISTS "email_blocklist" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "source_campaign_id" UUID,
  "blocked_at" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_blocklist_email" ON "email_blocklist" ("email");
CREATE INDEX IF NOT EXISTS "idx_email_blocklist_reason" ON "email_blocklist" ("reason");
