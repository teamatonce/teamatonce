/**
 * Team@Once Database Schema Definition
 * Using database's migration system
 * Note: User authentication is handled by database, so no users table is included
 */

export const schema = {
  // ============================================
  // PROJECT MANAGEMENT
  // ============================================

  projects: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'client_id', type: 'string', nullable: false }, // database user ID
      { name: 'name', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'project_type', type: 'string', nullable: false }, // e.g., 'web-app', 'mobile-app', 'ecommerce', etc.
      { name: 'template_id', type: 'string', nullable: true }, // Reference to project template used
      { name: 'status', type: 'string', nullable: false, default: 'planning' }, // planning, in_progress, review, completed, on_hold

      // Requirements & Specifications
      { name: 'requirements', type: 'jsonb', default: '{}' }, // Collected requirements from wizard
      { name: 'tech_stack', type: 'jsonb', default: '[]' }, // Selected technologies
      { name: 'frameworks', type: 'jsonb', default: '[]' }, // Selected frameworks
      { name: 'features', type: 'jsonb', default: '[]' }, // Required features list

      // Budget & Timeline
      { name: 'estimated_cost', type: 'numeric', nullable: true },
      { name: 'budget_min', type: 'numeric', nullable: true },
      { name: 'budget_max', type: 'numeric', nullable: true },
      { name: 'actual_cost', type: 'numeric', default: 0 },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'estimated_duration_days', type: 'integer', nullable: true },
      { name: 'start_date', type: 'date', nullable: true },
      { name: 'expected_completion_date', type: 'date', nullable: true },
      { name: 'preferred_end_date', type: 'date', nullable: true },
      { name: 'actual_completion_date', type: 'date', nullable: true },

      // Team Assignment
      { name: 'company_id', type: 'uuid', nullable: true }, // Company that created/owns this project
      { name: 'assigned_company_id', type: 'uuid', nullable: true }, // Developer company assigned to work on this project (set when proposal is accepted)
      { name: 'assigned_team', type: 'jsonb', default: '[]' }, // Array of team member IDs with roles
      { name: 'team_lead_id', type: 'string', nullable: true },

      // Progress Tracking
      { name: 'progress_percentage', type: 'numeric', default: 0 },
      { name: 'current_milestone_id', type: 'uuid', nullable: true },

      // Project Definition Scope
      { name: 'primary_objective', type: 'text', nullable: true },
      { name: 'key_performance_indicators', type: 'jsonb', default: '[]' },
      { name: 'success_criteria', type: 'jsonb', default: '[]' },

      // Project Settings
      { name: 'settings', type: 'jsonb', default: '{}' },
      { name: 'metadata', type: 'jsonb', default: '{}' },

      // Admin Approval (for job postings) - auto-approved by default, admin can reject later
      { name: 'approval_status', type: 'string', default: 'approved' }, // 'pending', 'approved', 'rejected'
      { name: 'approval_reviewed_by', type: 'string', nullable: true }, // Admin user ID
      { name: 'approval_reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'approval_rejection_reason', type: 'text', nullable: true },
      { name: 'is_public', type: 'boolean', default: true }, // Whether visible to freelancers (auto-approved jobs are public by default)

      // Force Close (for abandoned projects)
      { name: 'force_closed_at', type: 'timestamptz', nullable: true },
      { name: 'force_closed_by', type: 'string', nullable: true }, // Admin user ID
      { name: 'force_close_reason', type: 'text', nullable: true },

      // Professional Milestone Workflow (added for milestone planning phase)
      { name: 'awarded_at', type: 'timestamptz', nullable: true }, // When proposal was accepted
      { name: 'milestone_plan_approved_at', type: 'timestamptz', nullable: true }, // When milestone plan approved

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['client_id'] },
      { columns: ['company_id'] },
      { columns: ['assigned_company_id'] },
      { columns: ['status'] },
      { columns: ['project_type'] },
      { columns: ['team_lead_id'] },
      { columns: ['created_at'] },
      { columns: ['approval_status'] },
      { columns: ['is_public'] }
    ]
  },

  project_proposals: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'company_id', type: 'uuid', nullable: false }, // Developer company submitting proposal
      { name: 'submitted_by', type: 'string', nullable: false }, // Developer user ID who submitted

      // Proposal Details
      { name: 'cover_letter', type: 'text', nullable: true },
      { name: 'proposed_cost', type: 'numeric', nullable: false },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'proposed_duration_days', type: 'integer', nullable: false },
      { name: 'proposed_start_date', type: 'date', nullable: true },

      // Proposal Status
      { name: 'status', type: 'string', nullable: false, default: 'pending' }, // pending, accepted, rejected, withdrawn
      { name: 'reviewed_by', type: 'string', nullable: true }, // Client user ID who reviewed
      { name: 'reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'review_notes', type: 'text', nullable: true },

      // Milestones in Proposal
      { name: 'proposed_milestones', type: 'jsonb', default: '[]' }, // Array of milestone objects

      // Attachments & Details
      { name: 'attachments', type: 'jsonb', default: '[]' }, // Portfolio items, relevant work
      { name: 'team_composition', type: 'jsonb', default: '[]' }, // Proposed team members
      { name: 'similar_projects', type: 'jsonb', default: '[]' }, // References to similar completed projects

      // Revision Tracking (for proposal modifications)
      { name: 'revision_count', type: 'integer', default: 0 },
      { name: 'last_revision_at', type: 'timestamptz', nullable: true },

      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['company_id'] },
      { columns: ['submitted_by'] },
      { columns: ['status'] },
      { columns: ['created_at'] },
      { columns: ['project_id', 'company_id'], unique: true } // One proposal per company per project
    ]
  },

  // Hire Requests - Direct hire from client to seller
  hire_requests: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'client_id', type: 'string', nullable: false }, // database user ID of client
      { name: 'company_id', type: 'uuid', nullable: false }, // Developer company being hired
      { name: 'project_id', type: 'uuid', nullable: true }, // Created project ID (after acceptance)

      // Request Details
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: false },
      { name: 'category', type: 'string', nullable: false },

      // Payment Information
      { name: 'payment_type', type: 'string', nullable: false }, // 'hourly' or 'fixed'
      { name: 'hourly_rate', type: 'numeric', nullable: true },
      { name: 'estimated_hours', type: 'integer', nullable: true },
      { name: 'fixed_budget', type: 'numeric', nullable: true },
      { name: 'total_budget', type: 'numeric', nullable: false },

      // Timeline
      { name: 'start_date', type: 'date', nullable: false },
      { name: 'duration', type: 'string', nullable: false },

      // Additional Information
      { name: 'additional_details', type: 'text', nullable: true },
      { name: 'attachment_urls', type: 'jsonb', default: '[]' },

      // Status
      { name: 'status', type: 'string', nullable: false, default: 'pending' }, // pending, accepted, rejected, withdrawn, expired
      { name: 'response_message', type: 'text', nullable: true },
      { name: 'responded_at', type: 'timestamptz', nullable: true },
      { name: 'responded_by', type: 'string', nullable: true }, // Seller user ID who responded

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['client_id'] },
      { columns: ['company_id'] },
      { columns: ['status'] },
      { columns: ['created_at'] },
      { columns: ['project_id'] }
    ]
  },

  project_milestones: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'milestone_type', type: 'string', nullable: false }, // planning, design, development, testing, deployment, maintenance
      { name: 'order_index', type: 'integer', nullable: false },
      { name: 'status', type: 'string', nullable: false, default: 'pending' }, // pending, in_progress, submitted, feedback_required, completed, approved

      // Deliverables
      { name: 'deliverables', type: 'jsonb', default: '[]' },
      { name: 'acceptance_criteria', type: 'jsonb', default: '[]' },

      // Timeline
      { name: 'estimated_hours', type: 'numeric', nullable: true },
      { name: 'actual_hours', type: 'numeric', default: 0 },
      { name: 'start_date', type: 'date', nullable: true },
      { name: 'due_date', type: 'date', nullable: true },
      { name: 'completed_date', type: 'date', nullable: true },

      // Payment
      { name: 'milestone_amount', type: 'numeric', nullable: true },
      { name: 'payment_status', type: 'string', default: 'pending' }, // pending, paid, overdue
      { name: 'payment_date', type: 'date', nullable: true },

      // Approval
      { name: 'requires_approval', type: 'boolean', default: true },
      { name: 'approved_by', type: 'string', nullable: true },
      { name: 'approved_at', type: 'timestamptz', nullable: true },
      { name: 'approval_notes', type: 'text', nullable: true },

      // Submission Tracking (for developer submit workflow)
      { name: 'submitted_by', type: 'string', nullable: true }, // Developer who submitted
      { name: 'submitted_at', type: 'timestamptz', nullable: true }, // Submission timestamp
      { name: 'submission_count', type: 'integer', default: 0 }, // Track resubmissions

      // Feedback/Review Tracking (for client feedback)
      { name: 'feedback', type: 'text', nullable: true }, // Client feedback/change requests
      { name: 'reviewed_by', type: 'string', nullable: true }, // Client who reviewed
      { name: 'reviewed_at', type: 'timestamptz', nullable: true }, // Review timestamp

      // Enhanced metadata (Upwork-style professional details)
      { name: 'metadata', type: 'jsonb', default: '{}' }, // dependencies, resourcesRequired, reviewProcess, qualityMetrics, technicalDetails

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id', 'order_index'] },
      { columns: ['status'] },
      { columns: ['payment_status'] }
    ]
  },

  // Milestone Plans - For professional milestone planning workflow
  milestone_plans: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'proposal_id', type: 'uuid', nullable: false },
      { name: 'submitted_by', type: 'string', nullable: false }, // Developer user ID

      // Plan Status
      { name: 'status', type: 'string', nullable: false, default: 'draft' }, // draft, pending_review, changes_requested, approved, rejected

      // Milestone Details
      { name: 'milestones', type: 'jsonb', nullable: false, default: '[]' }, // Array of proposed milestone objects

      // Review Information
      { name: 'submitted_at', type: 'timestamptz', nullable: true },
      { name: 'reviewed_by', type: 'string', nullable: true }, // Client user ID
      { name: 'reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'client_feedback', type: 'text', nullable: true },

      // Version Control
      { name: 'revision_count', type: 'integer', default: 0 },
      { name: 'version', type: 'integer', default: 1 },

      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['proposal_id'] },
      { columns: ['submitted_by'] },
      { columns: ['status'] },
      { columns: ['created_at'] }
    ]
  },

  // Milestone Adjustment Requests - For requesting changes during execution
  milestone_adjustment_requests: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'milestone_id', type: 'uuid', nullable: false },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'requested_by', type: 'string', nullable: false }, // Developer user ID

      // Request Status
      { name: 'status', type: 'string', nullable: false, default: 'pending' }, // pending, approved, rejected

      // Proposed Changes
      { name: 'changes', type: 'jsonb', nullable: false }, // Object with proposed changes
      { name: 'reason', type: 'text', nullable: false }, // Why adjustment is needed

      // Review Information
      { name: 'reviewed_by', type: 'string', nullable: true }, // Client user ID
      { name: 'reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'client_response', type: 'text', nullable: true },

      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['milestone_id'] },
      { columns: ['project_id'] },
      { columns: ['requested_by'] },
      { columns: ['status'] },
      { columns: ['created_at'] }
    ]
  },

  project_tasks: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'parent_task_id', type: 'uuid', nullable: true }, // For subtasks - references another task's ID
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'task_type', type: 'string', nullable: false }, // feature, bug, enhancement, documentation
      { name: 'priority', type: 'string', default: 'medium' }, // low, medium, high, urgent
      { name: 'status', type: 'string', default: 'initialized' }, // initialized, inprogress, done

      // Assignment
      { name: 'assigned_to', type: 'string', nullable: true },
      { name: 'assigned_by', type: 'string', nullable: true },
      { name: 'assigned_at', type: 'timestamptz', nullable: true },

      // Time Tracking
      { name: 'estimated_hours', type: 'numeric', nullable: true },
      { name: 'actual_hours', type: 'numeric', default: 0 },
      { name: 'due_date', type: 'date', nullable: true },
      { name: 'completed_date', type: 'date', nullable: true },

      // Task Details
      { name: 'tags', type: 'jsonb', default: '[]' },
      { name: 'dependencies', type: 'jsonb', default: '[]' }, // Array of task IDs that must be completed first
      { name: 'attachments', type: 'jsonb', default: '[]' },
      { name: 'checklist', type: 'jsonb', default: '[]' },

      // Tracking
      { name: 'updated_by', type: 'string', nullable: true }, // User ID who last updated the task

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['milestone_id'] },
      { columns: ['parent_task_id'] },
      { columns: ['assigned_to'] },
      { columns: ['status'] },
      { columns: ['priority'] },
      { columns: ['updated_by'] }
    ]
  },

  project_files: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'file_name', type: 'string', nullable: false },
      { name: 'file_path', type: 'string', nullable: false }, // Storage path
      { name: 'file_url', type: 'string', nullable: false }, // Public URL
      { name: 'file_size', type: 'bigint', nullable: false }, // Size in bytes
      { name: 'mime_type', type: 'string', nullable: false },
      { name: 'file_type', type: 'string', nullable: false }, // document, image, video, audio, code, archive, other

      // Upload Info
      { name: 'uploaded_by', type: 'string', nullable: false },
      { name: 'uploaded_at', type: 'timestamptz', default: 'now()' },

      // File Metadata
      { name: 'description', type: 'text', nullable: true },
      { name: 'tags', type: 'jsonb', default: '[]' },
      { name: 'version', type: 'integer', default: 1 },
      { name: 'is_deliverable', type: 'boolean', default: false }, // If file is a milestone deliverable
      { name: 'deliverable_index', type: 'integer', nullable: true }, // Index in milestone deliverables array

      // Thumbnail (for images/videos)
      { name: 'thumbnail_url', type: 'string', nullable: true },

      // Access Control
      { name: 'is_public', type: 'boolean', default: false },
      { name: 'shared_with', type: 'jsonb', default: '[]' }, // Array of user IDs

      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['milestone_id'] },
      { columns: ['uploaded_by'] },
      { columns: ['file_type'] },
      { columns: ['is_deliverable'] },
      { columns: ['created_at'] }
    ]
  },

  // ============================================
  // COMMUNICATION & COLLABORATION
  // ============================================

  conversations: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: true },
      { name: 'conversation_type', type: 'string', nullable: false }, // direct, group, project
      { name: 'title', type: 'string', nullable: true },
      { name: 'participants', type: 'jsonb', nullable: false }, // Array of user IDs
      { name: 'created_by', type: 'string', nullable: false },
      { name: 'last_message_at', type: 'timestamptz', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['created_by'] },
      { columns: ['last_message_at'] }
    ]
  },

  messages: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'conversation_id', type: 'uuid', nullable: false },
      { name: 'sender_id', type: 'string', nullable: false },
      { name: 'message_type', type: 'string', default: 'text' }, // text, file, image, video, system
      { name: 'content', type: 'text', nullable: true },
      { name: 'attachments', type: 'jsonb', default: '[]' },
      { name: 'mentions', type: 'jsonb', default: '[]' }, // Array of mentioned user IDs
      { name: 'reply_to_id', type: 'uuid', nullable: true }, // For threaded messages
      { name: 'reactions', type: 'jsonb', default: '{}' }, // emoji reactions
      { name: 'read_by', type: 'jsonb', default: '[]' }, // Array of user IDs who read the message
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['conversation_id', 'created_at'] },
      { columns: ['sender_id'] },
      { columns: ['reply_to_id'] }
    ]
  },

  video_sessions: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'room_id', type: 'string', nullable: false }, // database video room ID
      { name: 'room_name', type: 'string', nullable: false },
      { name: 'session_type', type: 'string', default: 'meeting' }, // meeting, demo, review, training
      { name: 'scheduled_at', type: 'timestamptz', nullable: true },
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'ended_at', type: 'timestamptz', nullable: true },
      { name: 'duration_minutes', type: 'integer', nullable: true },
      { name: 'host_id', type: 'string', nullable: false },
      { name: 'participants', type: 'jsonb', default: '[]' },
      { name: 'recording_url', type: 'string', nullable: true },
      { name: 'recording_id', type: 'string', nullable: true },
      { name: 'is_recording', type: 'boolean', default: false }, // Current recording status
      { name: 'meeting_notes', type: 'text', nullable: true },
      { name: 'agenda', type: 'text', nullable: true },
      { name: 'status', type: 'string', default: 'scheduled' }, // scheduled, active, ended, cancelled
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['room_id'], unique: true },
      { columns: ['host_id'] },
      { columns: ['status'] },
      { columns: ['scheduled_at'] }
    ]
  },

  // Video session recordings - stores metadata for each recording
  video_session_recordings: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'video_session_id', type: 'uuid', nullable: false },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'database_recording_id', type: 'string', nullable: false }, // LiveKit egress ID
      { name: 'recording_url', type: 'text', nullable: true }, // Cloud storage URL (set after processing)
      { name: 'duration_seconds', type: 'integer', nullable: true },
      { name: 'file_size_bytes', type: 'bigint', nullable: true },
      { name: 'status', type: 'string', default: 'recording' }, // recording, processing, completed, failed
      { name: 'started_at', type: 'timestamptz', nullable: false },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
      { name: 'started_by', type: 'string', nullable: false }, // User ID who started recording
      { name: 'metadata', type: 'jsonb', default: '{}' }, // audio_only, transcription_enabled, etc.
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['video_session_id'] },
      { columns: ['project_id'] },
      { columns: ['status'] },
      { columns: ['database_recording_id'], unique: true },
      { columns: ['created_at'] }
    ]
  },

  meetings: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'meeting_type', type: 'string', nullable: false }, // video, audio, in_person
      { name: 'location', type: 'string', nullable: true }, // URL or physical location
      { name: 'start_time', type: 'timestamptz', nullable: false },
      { name: 'end_time', type: 'timestamptz', nullable: false },
      { name: 'attendees', type: 'jsonb', default: '[]' }, // Array of user IDs
      { name: 'agenda', type: 'text', nullable: true },
      { name: 'notes', type: 'text', nullable: true },
      { name: 'recording_url', type: 'string', nullable: true },
      { name: 'status', type: 'string', default: 'scheduled' }, // scheduled, in_progress, completed, cancelled
      { name: 'created_by', type: 'string', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['start_time'] },
      { columns: ['status'] },
      { columns: ['created_by'] }
    ]
  },

  whiteboard_sessions: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'canvas_data', type: 'jsonb', default: '{}' }, // Whiteboard canvas state
      { name: 'created_by', type: 'string', nullable: false },
      { name: 'last_modified', type: 'timestamptz', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['last_modified'] },
      { columns: ['created_by'] }
    ]
  },

  calendar_events: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'date', type: 'date', nullable: false }, // Event date
      { name: 'start_time', type: 'string', nullable: false }, // e.g., "09:00", "14:30"
      { name: 'end_time', type: 'string', nullable: false }, // e.g., "10:00", "15:30"
      { name: 'type', type: 'string', nullable: false, default: 'meeting' }, // meeting, deadline, call, review, milestone
      { name: 'meeting_url', type: 'text', nullable: true }, // Meeting URL (e.g., Google Meet, Zoom)
      { name: 'priority', type: 'string', nullable: true, default: 'normal' }, // high, medium, low, normal
      { name: 'status', type: 'string', nullable: true, default: 'upcoming' }, // upcoming, completed, cancelled
      { name: 'color', type: 'string', nullable: true }, // Color for calendar display
      { name: 'location', type: 'string', nullable: true },
      { name: 'attendees', type: 'jsonb', default: '[]' }, // Array of user IDs who are attending
      { name: 'reminder_minutes', type: 'integer', nullable: true }, // Minutes before event to send reminder
      { name: 'reminder_sent', type: 'boolean', default: false }, // Flag to track if reminder was sent
      { name: 'created_by', type: 'string', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['date'] },
      { columns: ['type'] },
      { columns: ['status'] },
      { columns: ['created_by'] },
      { columns: ['reminder_sent'] } // Index for cron job queries
    ]
  },

  // ============================================
  // CONTRACTS & PAYMENTS
  // ============================================

  contracts: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'client_id', type: 'string', nullable: false },
      { name: 'contract_type', type: 'string', nullable: false }, // fixed_price, hourly, milestone_based
      { name: 'status', type: 'string', default: 'draft' }, // draft, pending_signature, active, completed, terminated

      // Contract Details
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'terms', type: 'text', nullable: false },
      { name: 'scope_of_work', type: 'text', nullable: false },

      // Financial Terms
      { name: 'total_amount', type: 'numeric', nullable: false },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'payment_terms', type: 'jsonb', default: '{}' },
      { name: 'hourly_rate', type: 'numeric', nullable: true }, // For hourly contracts

      // Timeline
      { name: 'start_date', type: 'date', nullable: false },
      { name: 'end_date', type: 'date', nullable: false },
      { name: 'renewal_terms', type: 'jsonb', default: '{}' },

      // Signatures
      { name: 'client_signature', type: 'jsonb', nullable: true },
      { name: 'provider_signature', type: 'jsonb', nullable: true },
      { name: 'signed_at', type: 'timestamptz', nullable: true },

      // Documents
      { name: 'contract_document_url', type: 'string', nullable: true },
      { name: 'attachments', type: 'jsonb', default: '[]' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['client_id'] },
      { columns: ['status'] },
      { columns: ['start_date'] }
    ]
  },

  payments: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'contract_id', type: 'uuid', nullable: true },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'client_id', type: 'string', nullable: false },

      { name: 'payment_type', type: 'string', nullable: false }, // milestone, invoice, refund, partial
      { name: 'amount', type: 'numeric', nullable: false },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'status', type: 'string', default: 'pending' }, // pending, processing, completed, failed, refunded

      // Payment Method
      { name: 'payment_method', type: 'string', nullable: true }, // credit_card, bank_transfer, paypal, stripe
      { name: 'stripe_payment_intent_id', type: 'string', nullable: true },
      { name: 'stripe_charge_id', type: 'string', nullable: true },

      // Transaction Details
      { name: 'transaction_id', type: 'string', nullable: true },
      { name: 'transaction_date', type: 'timestamptz', nullable: true },
      { name: 'description', type: 'text', nullable: true },
      { name: 'invoice_number', type: 'string', nullable: true },
      { name: 'invoice_url', type: 'string', nullable: true },

      // Platform Fees
      { name: 'platform_fee', type: 'numeric', default: 0 },
      { name: 'net_amount', type: 'numeric', nullable: true }, // Amount after fees

      // Escrow System Fields
      { name: 'escrow_status', type: 'string', nullable: true }, // 'authorized', 'held', 'released', 'refunded', 'disputed'
      { name: 'escrow_hold_until', type: 'timestamptz', nullable: true },
      { name: 'escrow_released_at', type: 'timestamptz', nullable: true },
      { name: 'escrow_refunded_at', type: 'timestamptz', nullable: true },
      { name: 'stripe_connect_account_id', type: 'string', nullable: true }, // Developer's Stripe Connect account

      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['contract_id'] },
      { columns: ['milestone_id'] },
      { columns: ['client_id'] },
      { columns: ['status'] },
      { columns: ['transaction_id'], unique: true }
    ]
  },

  milestone_deliverables: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'milestone_id', type: 'uuid', nullable: false },
      { name: 'project_id', type: 'uuid', nullable: false },

      // Deliverable tracking
      { name: 'submitted_by', type: 'string', nullable: false }, // developer user ID
      { name: 'submitted_at', type: 'timestamptz', nullable: false },

      // Files/proof of work
      { name: 'deliverable_files', type: 'jsonb', default: '[]' }, // Array of file URLs
      { name: 'deliverable_description', type: 'text', nullable: true },
      { name: 'deliverable_type', type: 'string', nullable: true }, // 'code', 'design', 'documentation', etc.

      // Review status
      { name: 'review_status', type: 'string', default: 'pending' }, // pending, approved, changes_requested, disputed
      { name: 'reviewed_by', type: 'string', nullable: true }, // client user ID
      { name: 'reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'review_notes', type: 'text', nullable: true },

      // Auto-approval timeline
      { name: 'auto_approve_at', type: 'timestamptz', nullable: true }, // 14 days from submission
      { name: 'auto_approved', type: 'boolean', default: false },

      // Timestamps
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['milestone_id'] },
      { columns: ['project_id'] },
      { columns: ['review_status'] },
      { columns: ['auto_approve_at'] }
    ]
  },

  payment_disputes: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'payment_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'project_id', type: 'uuid', nullable: false },

      // Dispute details
      { name: 'dispute_reason', type: 'string', nullable: false }, // 'work_not_delivered', 'poor_quality', 'not_as_specified', etc.
      { name: 'dispute_description', type: 'text', nullable: false },
      { name: 'disputed_by', type: 'string', nullable: false }, // user ID (client or developer)
      { name: 'disputed_by_role', type: 'string', nullable: false }, // 'client' or 'seller'
      { name: 'dispute_amount', type: 'numeric', nullable: false },

      // Evidence
      { name: 'evidence_files', type: 'jsonb', default: '[]' }, // Array of file URLs (screenshots, docs, etc.)
      { name: 'evidence_description', type: 'text', nullable: true },

      // Response from other party
      { name: 'response_text', type: 'text', nullable: true },
      { name: 'response_files', type: 'jsonb', default: '[]' },
      { name: 'responded_by', type: 'string', nullable: true }, // user ID
      { name: 'responded_at', type: 'timestamptz', nullable: true },

      // Platform mediation
      { name: 'mediator_id', type: 'string', nullable: true }, // platform admin user ID
      { name: 'mediation_notes', type: 'text', nullable: true },
      { name: 'mediation_decision', type: 'string', nullable: true }, // 'client_favor', 'developer_favor', 'split', 'require_arbitration'
      { name: 'mediation_percentage', type: 'numeric', nullable: true }, // % to release to developer (0-100)
      { name: 'mediated_at', type: 'timestamptz', nullable: true },

      // Status tracking
      { name: 'status', type: 'string', default: 'open' }, // open, negotiating, mediation, resolved, arbitration, closed
      { name: 'resolution', type: 'string', nullable: true }, // 'full_refund', 'full_release', 'partial_refund', 'arbitration_pending'
      { name: 'resolved_at', type: 'timestamptz', nullable: true },
      { name: 'resolution_notes', type: 'text', nullable: true },

      // Timeline tracking
      { name: 'negotiation_deadline', type: 'timestamptz', nullable: true }, // 7 days from dispute creation
      { name: 'mediation_deadline', type: 'timestamptz', nullable: true }, // 2 days from negotiation end
      { name: 'response_deadline', type: 'timestamptz', nullable: true }, // 2 days from mediation

      // Final outcome
      { name: 'refund_amount', type: 'numeric', nullable: true },
      { name: 'release_amount', type: 'numeric', nullable: true },
      { name: 'refund_processed_at', type: 'timestamptz', nullable: true },
      { name: 'release_processed_at', type: 'timestamptz', nullable: true },

      // Timestamps
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['payment_id'] },
      { columns: ['milestone_id'] },
      { columns: ['project_id'] },
      { columns: ['status'] },
      { columns: ['dispute_reason'] }
    ]
  },

  escrow_timeline_events: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'payment_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'dispute_id', type: 'uuid', nullable: true },

      { name: 'event_type', type: 'string', nullable: false },
      // Event types: 'escrow_funded', 'deliverable_submitted', 'auto_approve_scheduled',
      // 'client_approved', 'client_requested_changes', 'dispute_opened', 'dispute_resolved',
      // 'payment_released', 'payment_refunded', 'evidence_submitted', etc.

      { name: 'event_description', type: 'text', nullable: false },
      { name: 'event_data', type: 'jsonb', default: '{}' }, // Additional data
      { name: 'triggered_by', type: 'string', nullable: true }, // user ID
      { name: 'triggered_by_role', type: 'string', nullable: true }, // 'client', 'developer', 'system', 'admin'

      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['payment_id'] },
      { columns: ['dispute_id'] },
      { columns: ['milestone_id'] },
      { columns: ['event_type'] },
      { columns: ['created_at'] }
    ]
  },

  stripe_connect_accounts: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false }, // Developer user ID
      { name: 'stripe_account_id', type: 'string', nullable: false },
      { name: 'account_type', type: 'string', default: 'express' }, // 'express' or 'standard'
      { name: 'business_type', type: 'string', default: 'individual' }, // 'individual' or 'company'
      { name: 'country', type: 'string', nullable: false },
      { name: 'email', type: 'string', nullable: false },
      { name: 'charges_enabled', type: 'boolean', default: false },
      { name: 'payouts_enabled', type: 'boolean', default: false },
      { name: 'is_onboarded', type: 'boolean', default: false }, // Whether onboarding is complete
      { name: 'details_submitted', type: 'boolean', default: false }, // Whether details have been submitted to Stripe
      { name: 'capabilities', type: 'jsonb', default: '{}' },
      { name: 'requirements', type: 'jsonb', default: '{}' },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id'] },
      { columns: ['stripe_account_id'], unique: true },
      { columns: ['email'] }
    ]
  },

  // ============================================
  // SUPPORT & MAINTENANCE
  // ============================================

  support_packages: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'client_id', type: 'string', nullable: false },
      { name: 'package_name', type: 'string', nullable: false },
      { name: 'package_type', type: 'string', nullable: false }, // basic, standard, premium, enterprise
      { name: 'status', type: 'string', default: 'active' }, // active, expired, cancelled

      // Package Details
      { name: 'monthly_hours', type: 'integer', nullable: false }, // Support hours per month
      { name: 'used_hours', type: 'numeric', default: 0 },
      { name: 'response_time_sla', type: 'integer', nullable: true }, // Response time in hours
      { name: 'includes_features', type: 'jsonb', default: '[]' },

      // Pricing
      { name: 'monthly_cost', type: 'numeric', nullable: false },
      { name: 'currency', type: 'string', default: 'USD' },

      // Dates
      { name: 'start_date', type: 'date', nullable: false },
      { name: 'end_date', type: 'date', nullable: true },
      { name: 'renewal_date', type: 'date', nullable: true },
      { name: 'auto_renew', type: 'boolean', default: true },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['client_id'] },
      { columns: ['status'] }
    ]
  },

  support_tickets: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'package_id', type: 'uuid', nullable: true },
      { name: 'client_id', type: 'string', nullable: false },
      { name: 'assigned_to', type: 'string', nullable: true },

      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: false },
      { name: 'ticket_type', type: 'string', nullable: false }, // bug, feature_request, question, enhancement
      { name: 'priority', type: 'string', default: 'medium' }, // low, medium, high, critical
      { name: 'status', type: 'string', default: 'open' }, // open, in_progress, resolved, closed

      // Time Tracking
      { name: 'estimated_hours', type: 'numeric', nullable: true },
      { name: 'actual_hours', type: 'numeric', default: 0 },
      { name: 'response_time_minutes', type: 'integer', nullable: true },
      { name: 'resolution_time_minutes', type: 'integer', nullable: true },

      // Dates
      { name: 'reported_at', type: 'timestamptz', default: 'now()' },
      { name: 'responded_at', type: 'timestamptz', nullable: true },
      { name: 'resolved_at', type: 'timestamptz', nullable: true },
      { name: 'closed_at', type: 'timestamptz', nullable: true },

      // Details
      { name: 'tags', type: 'jsonb', default: '[]' },
      { name: 'attachments', type: 'jsonb', default: '[]' },
      { name: 'resolution_notes', type: 'text', nullable: true },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['package_id'] },
      { columns: ['client_id'] },
      { columns: ['assigned_to'] },
      { columns: ['status'] },
      { columns: ['priority'] }
    ]
  },

  ticket_comments: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'ticket_id', type: 'uuid', nullable: false },
      { name: 'author_id', type: 'string', nullable: false },
      { name: 'content', type: 'text', nullable: false },
      { name: 'is_internal', type: 'boolean', default: false }, // Internal notes vs client-visible
      { name: 'attachments', type: 'jsonb', default: '[]' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['ticket_id', 'created_at'] },
      { columns: ['author_id'] }
    ]
  },

  // ============================================
  // DEVELOPER COMPANIES & TEAM MANAGEMENT
  // ============================================

  developer_companies: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'owner_id', type: 'string', nullable: false }, // database user ID of company owner

      // Account Type & Basic Info
      { name: 'account_type', type: 'string', nullable: false }, // 'solo', 'team', 'company'
      { name: 'company_name', type: 'string', nullable: true },
      { name: 'display_name', type: 'string', nullable: false },

      // Business Information
      { name: 'business_type', type: 'string', nullable: true }, // 'individual', 'llc', 'corporation', 'partnership'
      { name: 'tax_id', type: 'string', nullable: true },
      { name: 'company_size', type: 'string', nullable: true }, // '1', '2-10', '11-50', '51-200', '201+'
      { name: 'website', type: 'string', nullable: true },
      { name: 'description', type: 'text', nullable: true },
      { name: 'logo_url', type: 'string', nullable: true },

      // Contact Information
      { name: 'business_email', type: 'string', nullable: true },
      { name: 'business_phone', type: 'string', nullable: true },
      { name: 'business_address', type: 'jsonb', default: '{}' },

      // Settings
      { name: 'timezone', type: 'string', default: 'UTC' },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'language', type: 'string', default: 'en' },
      { name: 'settings', type: 'jsonb', default: '{}' },

      // Subscription
      { name: 'subscription_tier', type: 'string', default: 'free' },
      { name: 'subscription_status', type: 'string', default: 'active' },
      { name: 'stripe_customer_id', type: 'string', nullable: true },

      // Status
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'is_verified', type: 'boolean', default: false },
      { name: 'verified_at', type: 'timestamptz', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },

      // ============================================
      // PROFESSIONAL PROFILE FIELDS
      // ============================================

      // Professional Details
      { name: 'cover_image', type: 'string', nullable: true },
      { name: 'professional_title', type: 'string', nullable: true },
      { name: 'tagline', type: 'text', nullable: true },
      { name: 'hourly_rate', type: 'numeric', default: 50.00 },
      { name: 'availability', type: 'string', default: 'available' }, // 'available', 'busy', 'away'
      { name: 'response_time', type: 'string', default: 'within 24 hours' },

      // Professional Stats (calculated from projects/payments)
      { name: 'profile_rating', type: 'numeric', default: 0.00 },
      { name: 'total_reviews', type: 'integer', default: 0 },
      { name: 'total_earnings', type: 'numeric', default: 0.00 },
      { name: 'completed_projects', type: 'integer', default: 0 },
      { name: 'success_rate', type: 'numeric', default: 100.00 },
      { name: 'on_time_delivery', type: 'numeric', default: 100.00 },

      // Profile Content (stored as JSONB for flexibility)
      { name: 'profile_skills', type: 'jsonb', default: '[]' },
      { name: 'profile_languages', type: 'jsonb', default: '[]' },
      { name: 'profile_education', type: 'jsonb', default: '[]' },
      { name: 'profile_certifications', type: 'jsonb', default: '[]' },
      { name: 'profile_experience', type: 'jsonb', default: '[]' },
      { name: 'profile_portfolio', type: 'jsonb', default: '[]' },
      { name: 'profile_social_links', type: 'jsonb', default: '{}' },

      // Profile Badges
      { name: 'profile_verified', type: 'boolean', default: false },
      { name: 'profile_top_rated', type: 'boolean', default: false },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['owner_id'] },
      { columns: ['account_type'] },
      { columns: ['is_active'] },
      { columns: ['subscription_tier'] },
      { columns: ['created_at'] },
      { columns: ['profile_rating'] },
      { columns: ['profile_verified'] },
      { columns: ['profile_top_rated'] },
      { columns: ['hourly_rate'] }
    ]
  },

  company_team_members: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'company_id', type: 'uuid', nullable: false },
      { name: 'user_id', type: 'string', nullable: true }, // database user ID (null if invitation pending)

      // Member Information
      { name: 'name', type: 'string', nullable: false },
      { name: 'email', type: 'string', nullable: false },
      { name: 'avatar_url', type: 'string', nullable: true },
      { name: 'title', type: 'string', nullable: true },
      { name: 'bio', type: 'text', nullable: true },

      // Role & Permissions
      { name: 'role', type: 'string', nullable: false }, // 'owner', 'admin', 'developer', 'designer', 'qa'
      { name: 'permissions', type: 'jsonb', default: '[]' },
      { name: 'is_owner', type: 'boolean', default: false },

      // Skills & Experience
      { name: 'skills', type: 'jsonb', default: '[]' },
      { name: 'specializations', type: 'jsonb', default: '[]' },
      { name: 'technologies', type: 'jsonb', default: '[]' },
      { name: 'expertise', type: 'jsonb', default: '[]' },
      { name: 'experience_years', type: 'integer', default: 0 },

      // Work Details
      { name: 'hourly_rate', type: 'numeric', nullable: true },
      { name: 'currency', type: 'string', default: 'USD' },

      // Availability & Workload
      { name: 'availability', type: 'string', default: 'available' }, // 'available', 'busy', 'offline', 'on_leave'
      { name: 'status', type: 'string', default: 'pending' }, // 'active', 'pending', 'inactive', 'suspended'
      { name: 'workload_percentage', type: 'numeric', default: 0 },
      { name: 'capacity_hours_per_week', type: 'integer', default: 40 },

      // Current Work
      { name: 'current_projects', type: 'integer', default: 0 },
      { name: 'current_project_ids', type: 'jsonb', default: '[]' },
      { name: 'hours_this_week', type: 'numeric', default: 0 },
      { name: 'hours_this_month', type: 'numeric', default: 0 },

      // Contact & Social
      { name: 'phone', type: 'string', nullable: true },
      { name: 'location', type: 'string', nullable: true },
      { name: 'timezone', type: 'string', nullable: true },
      { name: 'social_links', type: 'jsonb', default: '{}' },

      // Performance
      { name: 'rating', type: 'numeric', nullable: true },
      { name: 'projects_completed', type: 'integer', default: 0 },
      { name: 'total_hours_worked', type: 'numeric', default: 0 },
      { name: 'on_time_delivery_rate', type: 'numeric', nullable: true },

      // Status Tracking
      { name: 'is_online', type: 'boolean', default: false },
      { name: 'last_seen_at', type: 'timestamptz', nullable: true },
      { name: 'joined_date', type: 'date', nullable: false, default: 'CURRENT_DATE' },
      { name: 'activated_at', type: 'timestamptz', nullable: true },
      { name: 'deactivated_at', type: 'timestamptz', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['company_id', 'email'], unique: true },
      { columns: ['company_id'] },
      { columns: ['user_id'] },
      { columns: ['email'] },
      { columns: ['role'] },
      { columns: ['status'] },
      { columns: ['availability'] },
      { columns: ['is_online'] },
      { columns: ['joined_date'] }
    ]
  },

  team_invitations: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'company_id', type: 'uuid', nullable: false },
      { name: 'invited_by', type: 'string', nullable: false }, // database user ID

      // Invitation Details
      { name: 'email', type: 'string', nullable: false },
      { name: 'name', type: 'string', nullable: true },
      { name: 'role', type: 'string', nullable: false }, // 'admin', 'developer', 'designer', 'qa'
      { name: 'message', type: 'text', nullable: true },

      // Initial Setup
      { name: 'initial_skills', type: 'jsonb', default: '[]' },
      { name: 'hourly_rate', type: 'numeric', nullable: true },
      { name: 'initial_projects', type: 'jsonb', default: '[]' },

      // Status
      { name: 'status', type: 'string', default: 'pending' }, // 'pending', 'accepted', 'declined', 'expired', 'cancelled'
      { name: 'token', type: 'string', nullable: false },
      { name: 'expires_at', type: 'timestamptz', nullable: false },

      // Response
      { name: 'accepted_at', type: 'timestamptz', nullable: true },
      { name: 'declined_at', type: 'timestamptz', nullable: true },
      { name: 'cancelled_at', type: 'timestamptz', nullable: true },
      { name: 'decline_reason', type: 'text', nullable: true },
      { name: 'team_member_id', type: 'uuid', nullable: true },

      // Tracking
      { name: 'sent_count', type: 'integer', default: 0 },
      { name: 'last_sent_at', type: 'timestamptz', nullable: true },
      { name: 'opened_at', type: 'timestamptz', nullable: true },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['company_id', 'email'] },
      { columns: ['token'], unique: true },
      { columns: ['status'] },
      { columns: ['expires_at'] },
      { columns: ['email'] },
      { columns: ['invited_by'] }
    ]
  },

  team_member_project_assignments: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'company_id', type: 'uuid', nullable: false },
      { name: 'team_member_id', type: 'uuid', nullable: false },
      { name: 'project_id', type: 'uuid', nullable: false },

      // Assignment Details
      { name: 'project_role', type: 'string', nullable: false }, // 'lead', 'developer', 'designer', 'qa', 'reviewer'
      { name: 'allocation_percentage', type: 'numeric', nullable: false },
      { name: 'estimated_hours', type: 'numeric', nullable: true },

      // Timeline
      { name: 'assigned_at', type: 'timestamptz', default: 'now()' },
      { name: 'assigned_by', type: 'string', nullable: false },
      { name: 'start_date', type: 'date', nullable: true },
      { name: 'end_date', type: 'date', nullable: true },
      { name: 'removed_at', type: 'timestamptz', nullable: true },
      { name: 'removed_by', type: 'string', nullable: true },

      // Work Tracking
      { name: 'actual_hours', type: 'numeric', default: 0 },
      { name: 'billable_hours', type: 'numeric', default: 0 },
      { name: 'tasks_assigned', type: 'integer', default: 0 },
      { name: 'tasks_completed', type: 'integer', default: 0 },

      // Status
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'is_primary', type: 'boolean', default: false },
      { name: 'status', type: 'string', default: 'active' }, // 'active', 'paused', 'completed', 'removed'
      { name: 'project_permissions', type: 'jsonb', default: '[]' },

      // Performance
      { name: 'project_rating', type: 'numeric', nullable: true },
      { name: 'feedback', type: 'text', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['company_id'] },
      { columns: ['team_member_id'] },
      { columns: ['project_id'] },
      { columns: ['team_member_id', 'project_id'], unique: true },
      { columns: ['project_role'] },
      { columns: ['is_active'] },
      { columns: ['status'] }
    ]
  },

  // ============================================
  // TEAM & RESOURCES (Original - Kept for compatibility)
  // ============================================

  team_members: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID
      { name: 'display_name', type: 'string', nullable: false },
      { name: 'role', type: 'string', nullable: false }, // developer, designer, qa, pm, devops
      { name: 'specialization', type: 'jsonb', default: '[]' }, // Array of specializations
      { name: 'skills', type: 'jsonb', default: '[]' },
      { name: 'technologies', type: 'jsonb', default: '[]' }, // Technologies they work with
      { name: 'experience_years', type: 'integer', default: 0 },
      { name: 'hourly_rate', type: 'numeric', nullable: true },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'availability_status', type: 'string', default: 'available' }, // available, busy, unavailable
      { name: 'current_projects', type: 'jsonb', default: '[]' },
      { name: 'capacity_hours_per_week', type: 'integer', default: 40 },
      { name: 'profile_image', type: 'string', nullable: true },
      { name: 'bio', type: 'text', nullable: true },
      { name: 'portfolio_url', type: 'string', nullable: true },
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id'], unique: true },
      { columns: ['role'] },
      { columns: ['availability_status'] },
      { columns: ['is_active'] }
    ]
  },

  project_team_assignments: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'team_member_id', type: 'uuid', nullable: false },
      { name: 'project_role', type: 'string', nullable: false }, // lead, developer, designer, etc.
      { name: 'assigned_at', type: 'timestamptz', default: 'now()' },
      { name: 'removed_at', type: 'timestamptz', nullable: true },
      { name: 'allocation_percentage', type: 'integer', default: 100 }, // % of time allocated to this project
      { name: 'is_active', type: 'boolean', default: true }
    ],
    indexes: [
      { columns: ['project_id', 'team_member_id'], unique: true },
      { columns: ['team_member_id'] },
      { columns: ['is_active'] }
    ]
  },

  // Project Members - Tracks who has access to a project (clients and sellers)
  project_members: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID
      { name: 'member_type', type: 'string', nullable: false }, // 'client' or 'seller'
      { name: 'company_id', type: 'uuid', nullable: true }, // Seller's company ID (null for clients)
      { name: 'role', type: 'string', nullable: false }, // 'owner', 'admin', 'developer', 'viewer'
      { name: 'permissions', type: 'jsonb', default: '[]' }, // Array of permission strings
      { name: 'joined_at', type: 'timestamptz', default: 'now()' },
      { name: 'left_at', type: 'timestamptz', nullable: true },
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id', 'user_id'], unique: true },
      { columns: ['user_id'] },
      { columns: ['project_id'] },
      { columns: ['member_type'] },
      { columns: ['is_active'] },
      { columns: ['company_id'] }
    ]
  },

  // ============================================
  // TEMPLATES & CONFIGURATIONS
  // ============================================

  project_templates: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'string', nullable: false },
      { name: 'slug', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'category', type: 'string', nullable: false }, // e.g., 'business', 'ecommerce', 'content', etc.
      { name: 'subcategory', type: 'string', nullable: true },
      { name: 'icon', type: 'string', nullable: true },
      { name: 'thumbnail', type: 'string', nullable: true },

      // Template Configuration
      { name: 'default_tech_stack', type: 'jsonb', default: '[]' },
      { name: 'recommended_frameworks', type: 'jsonb', default: '[]' },
      { name: 'default_features', type: 'jsonb', default: '[]' },
      { name: 'default_milestones', type: 'jsonb', default: '[]' },
      { name: 'requirement_questions', type: 'jsonb', default: '[]' }, // Questions to ask in wizard

      // Pricing
      { name: 'base_price', type: 'numeric', nullable: true },
      { name: 'estimated_duration_days', type: 'integer', nullable: true },
      { name: 'complexity_level', type: 'string', default: 'medium' }, // simple, medium, complex

      // Metadata
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'usage_count', type: 'integer', default: 0 },
      { name: 'rating', type: 'numeric', nullable: true },
      { name: 'tags', type: 'jsonb', default: '[]' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['slug'], unique: true },
      { columns: ['category'] },
      { columns: ['is_active'] }
    ]
  },

  // ============================================
  // FEEDBACK & REVIEWS
  // ============================================

  project_feedback: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'client_id', type: 'string', nullable: false },
      { name: 'feedback_type', type: 'string', nullable: false }, // milestone_review, project_review, general
      { name: 'rating', type: 'integer', nullable: true }, // 1-5 stars
      { name: 'title', type: 'string', nullable: true },
      { name: 'content', type: 'text', nullable: false },
      { name: 'areas_of_improvement', type: 'jsonb', default: '[]' },
      { name: 'positive_aspects', type: 'jsonb', default: '[]' },
      { name: 'attachments', type: 'jsonb', default: '[]' },
      { name: 'is_public', type: 'boolean', default: false },
      { name: 'response', type: 'text', nullable: true },
      { name: 'responded_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['milestone_id'] },
      { columns: ['client_id'] },
      { columns: ['feedback_type'] }
    ]
  },

  // ============================================
  // PROJECT DEFINITION
  // ============================================

  project_requirements: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'title', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: false },
      { name: 'type', type: 'string', nullable: false }, // functional, non-functional, business, technical
      { name: 'priority', type: 'string', nullable: false }, // low, medium, high, critical
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['type'] },
      { columns: ['priority'] }
    ]
  },

  project_stakeholders: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'role', type: 'string', nullable: false }, // product-owner, end-user, business-stakeholder, technical-stakeholder
      { name: 'expected_outcome', type: 'text', nullable: false },
      { name: 'contact_email', type: 'string', nullable: true },
      { name: 'contact_phone', type: 'string', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['role'] }
    ]
  },

  project_constraints: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'type', type: 'string', nullable: false }, // technical, business, assumption
      { name: 'description', type: 'text', nullable: false },
      { name: 'impact', type: 'text', nullable: true },
      { name: 'mitigation_strategy', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['type'] }
    ]
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================

  notifications: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false },
      { name: 'notification_type', type: 'string', nullable: false }, // project_update, payment, milestone, message, etc.
      { name: 'title', type: 'string', nullable: false },
      { name: 'message', type: 'text', nullable: false },
      { name: 'action_url', type: 'string', nullable: true },
      { name: 'action_data', type: 'jsonb', nullable: true },
      { name: 'priority', type: 'string', default: 'normal' }, // low, normal, high
      { name: 'is_read', type: 'boolean', default: false },
      { name: 'read_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id', 'is_read'] },
      { columns: ['user_id', 'created_at'] },
      { columns: ['notification_type'] }
    ]
  },

  // ============================================
  // SUBSCRIPTIONS & PAYMENT METHODS
  // ============================================

  subscriptions: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'company_id', type: 'uuid', nullable: false },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID

      // Stripe Details
      { name: 'stripe_customer_id', type: 'string', nullable: true },
      { name: 'stripe_subscription_id', type: 'string', nullable: true },
      { name: 'price_id', type: 'string', nullable: true },

      // Plan Information
      { name: 'plan_name', type: 'string', nullable: true }, // basic, pro, enterprise
      { name: 'billing_interval', type: 'string', nullable: true }, // monthly, yearly
      { name: 'status', type: 'string', default: 'active' }, // active, past_due, canceled, incomplete, trialing, unpaid

      // Billing Period
      { name: 'current_period_start', type: 'timestamptz', nullable: true },
      { name: 'current_period_end', type: 'timestamptz', nullable: true },
      { name: 'cancel_at_period_end', type: 'boolean', default: false },
      { name: 'canceled_at', type: 'timestamptz', nullable: true },
      { name: 'ended_at', type: 'timestamptz', nullable: true },

      // Trial Period
      { name: 'trial_start', type: 'timestamptz', nullable: true },
      { name: 'trial_end', type: 'timestamptz', nullable: true },

      // Metadata
      { name: 'metadata', type: 'jsonb', default: '{}' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['company_id'] },
      { columns: ['user_id'] },
      { columns: ['stripe_customer_id'] },
      { columns: ['stripe_subscription_id'], unique: true },
      { columns: ['status'] },
      { columns: ['plan_name'] }
    ]
  },

  payment_methods: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'company_id', type: 'uuid', nullable: false },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID

      // Stripe Payment Method Details
      { name: 'stripe_payment_method_id', type: 'string', nullable: false },
      { name: 'stripe_customer_id', type: 'string', nullable: true },

      // Card Details
      { name: 'type', type: 'string', nullable: false }, // card, bank_account, etc.
      { name: 'last4', type: 'string', nullable: true },
      { name: 'brand', type: 'string', nullable: true }, // visa, mastercard, amex, etc.
      { name: 'exp_month', type: 'integer', nullable: true },
      { name: 'exp_year', type: 'integer', nullable: true },

      // Status
      { name: 'is_default', type: 'boolean', default: false },
      { name: 'is_active', type: 'boolean', default: true },

      // Metadata
      { name: 'metadata', type: 'jsonb', default: '{}' },

      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['company_id'] },
      { columns: ['user_id'] },
      { columns: ['stripe_payment_method_id'], unique: true },
      { columns: ['stripe_customer_id'] },
      { columns: ['is_default'] }
    ]
  },

  // ============================================
  // ANALYTICS & TRACKING
  // ============================================

  activity_logs: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false },
      { name: 'project_id', type: 'uuid', nullable: true },
      { name: 'activity_type', type: 'string', nullable: false },
      { name: 'entity_type', type: 'string', nullable: true }, // project, milestone, task, etc.
      { name: 'entity_id', type: 'uuid', nullable: true },
      { name: 'action', type: 'string', nullable: false }, // created, updated, deleted, viewed
      { name: 'changes', type: 'jsonb', nullable: true }, // Old and new values
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'ip_address', type: 'string', nullable: true },
      { name: 'user_agent', type: 'string', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id', 'created_at'] },
      { columns: ['project_id', 'created_at'] },
      { columns: ['entity_type', 'entity_id'] },
      { columns: ['activity_type'] }
    ]
  },

  project_analytics: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'date', type: 'date', nullable: false },
      { name: 'hours_worked', type: 'numeric', default: 0 },
      { name: 'tasks_completed', type: 'integer', default: 0 },
      { name: 'messages_sent', type: 'integer', default: 0 },
      { name: 'meetings_held', type: 'integer', default: 0 },
      { name: 'active_team_members', type: 'integer', default: 0 },
      { name: 'progress_delta', type: 'numeric', default: 0 }, // Daily progress change
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['project_id', 'date'], unique: true },
      { columns: ['project_id'] },
      { columns: ['date'] }
    ]
  },

  // ============================================
  // NOTES SYSTEM
  // ============================================

  notes: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'title', type: 'string', nullable: false },
      { name: 'content', type: 'text', nullable: true }, // HTML content
      { name: 'content_text', type: 'text', nullable: true }, // Plaintext for search
      { name: 'parent_id', type: 'uuid', nullable: true }, // For hierarchical notes
      { name: 'created_by', type: 'string', nullable: false }, // database user ID
      { name: 'last_edited_by', type: 'string', nullable: true },
      { name: 'position', type: 'integer', default: 0 }, // Ordering within parent
      { name: 'icon', type: 'string', nullable: true }, // Emoji or icon
      { name: 'cover_image', type: 'string', nullable: true }, // Cover image URL
      { name: 'tags', type: 'jsonb', default: '[]' }, // Array of tags
      { name: 'attachments', type: 'jsonb', default: '{}' }, // { file_attachment: [], note_attachment: [] }
      { name: 'is_pinned', type: 'boolean', default: false },
      { name: 'is_favorite', type: 'boolean', default: false },
      { name: 'is_archived', type: 'boolean', default: false },
      { name: 'archived_at', type: 'timestamptz', nullable: true },
      { name: 'shared_with', type: 'jsonb', default: '[]' }, // Array of user IDs
      { name: 'view_count', type: 'integer', default: 0 },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['project_id'] },
      { columns: ['parent_id'] },
      { columns: ['created_by'] },
      { columns: ['is_pinned'] },
      { columns: ['is_favorite'] },
      { columns: ['is_archived'] },
      { columns: ['deleted_at'] },
      { columns: ['project_id', 'position'] }
    ]
  },

  // ============================================
  // HEALTH METRICS (Used for notification preferences, push subscriptions, etc.)
  // ============================================

  health_metrics: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID
      { name: 'metric_type', type: 'string', nullable: false }, // 'notification_preferences', 'push_subscription', etc.
      { name: 'value', type: 'numeric', nullable: true },
      { name: 'unit', type: 'string', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' }, // Stores preferences, subscription data, etc.
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id'] },
      { columns: ['metric_type'] },
      { columns: ['user_id', 'metric_type'] }
    ]
  },

  // ============================================
  // FCM DEVICE TOKENS (Firebase Cloud Messaging)
  // ============================================

  device_tokens: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false }, // database user ID
      { name: 'token', type: 'string', nullable: false }, // FCM registration token
      { name: 'device_type', type: 'string', nullable: false }, // 'android', 'ios', 'web'
      { name: 'device_name', type: 'string', nullable: true }, // Device name (e.g., "iPhone 15 Pro")
      { name: 'device_id', type: 'string', nullable: true }, // Unique device identifier
      { name: 'app_version', type: 'string', nullable: true }, // App version
      { name: 'os_version', type: 'string', nullable: true }, // OS version
      { name: 'is_active', type: 'boolean', default: true },
      { name: 'last_used_at', type: 'timestamptz', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id'] },
      { columns: ['token'], unique: true },
      { columns: ['device_type'] },
      { columns: ['is_active'] },
      { columns: ['user_id', 'is_active'] }
    ]
  },

  // ============================================
  // ADMIN PANEL - FAQ, REPORTS, EMAIL CAMPAIGNS
  // ============================================

  faqs: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'question', type: 'text', nullable: false },
      { name: 'answer', type: 'text', nullable: false },
      { name: 'category', type: 'string', nullable: true }, // e.g., 'general', 'payment', 'projects', 'account'
      { name: 'order_index', type: 'integer', default: 0 },
      { name: 'is_published', type: 'boolean', default: true },
      { name: 'created_by', type: 'string', nullable: false }, // Admin user ID
      { name: 'updated_by', type: 'string', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true }
    ],
    indexes: [
      { columns: ['is_published'] },
      { columns: ['category'] },
      { columns: ['order_index'] },
      { columns: ['created_by'] }
    ]
  },

  reports: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'reporter_id', type: 'string', nullable: false }, // User who reported
      { name: 'report_type', type: 'string', nullable: false }, // 'user', 'job', 'project', 'gig', 'message'
      { name: 'target_id', type: 'string', nullable: false }, // ID of reported entity
      { name: 'target_user_id', type: 'string', nullable: true }, // User who owns the reported content
      { name: 'reason', type: 'string', nullable: false }, // 'spam', 'inappropriate', 'fraud', 'harassment', 'other'
      { name: 'description', type: 'text', nullable: true },
      { name: 'evidence_urls', type: 'jsonb', default: '[]' }, // Screenshots, links
      { name: 'status', type: 'string', default: 'pending' }, // 'pending', 'reviewing', 'resolved', 'dismissed'
      { name: 'resolution', type: 'string', nullable: true }, // 'content_removed', 'user_warned', 'user_banned', 'no_action'
      { name: 'resolution_notes', type: 'text', nullable: true },
      { name: 'reviewed_by', type: 'string', nullable: true }, // Admin who reviewed
      { name: 'reviewed_at', type: 'timestamptz', nullable: true },
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['reporter_id'] },
      { columns: ['target_id'] },
      { columns: ['target_user_id'] },
      { columns: ['report_type'] },
      { columns: ['status'] },
      { columns: ['reason'] },
      { columns: ['created_at'] }
    ]
  },

  email_campaigns: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'string', nullable: false },
      { name: 'subject', type: 'string', nullable: false },
      { name: 'content_html', type: 'text', nullable: false },
      { name: 'content_text', type: 'text', nullable: true },
      { name: 'target_audience', type: 'string', nullable: false }, // 'all', 'clients', 'sellers', 'pending_approval'
      { name: 'target_filters', type: 'jsonb', default: '{}' }, // Additional filters
      { name: 'status', type: 'string', default: 'draft' }, // 'draft', 'scheduled', 'sending', 'sent', 'failed'
      { name: 'scheduled_at', type: 'timestamptz', nullable: true },
      { name: 'sent_at', type: 'timestamptz', nullable: true },
      { name: 'total_recipients', type: 'integer', default: 0 },
      { name: 'sent_count', type: 'integer', default: 0 },
      { name: 'failed_count', type: 'integer', default: 0 },
      { name: 'created_by', type: 'string', nullable: false }, // Admin user ID
      { name: 'metadata', type: 'jsonb', default: '{}' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['status'] },
      { columns: ['target_audience'] },
      { columns: ['scheduled_at'] },
      { columns: ['created_by'] },
      { columns: ['created_at'] }
    ]
  },

  // ============================================
  // DATA ENGINE - RAW CRAWLED DATA
  // ============================================

  crawled_data: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'source', type: 'string', nullable: false },        // 'github', 'hackernews'
      { name: 'type', type: 'string', nullable: false },          // 'profile', 'job_post'
      { name: 'source_url', type: 'string', nullable: false },    // Unique URL
      { name: 'source_id', type: 'string', nullable: true },      // ID from source platform
      { name: 'raw_data', type: 'jsonb', nullable: false },       // Full raw data
      { name: 'crawled_at', type: 'timestamptz', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['source', 'type'] },
      { columns: ['source_url'], unique: true },
      { columns: ['crawled_at'] }
    ]
  },

  crawl_jobs: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'source', type: 'string', nullable: false },
      { name: 'status', type: 'string', default: 'pending' },   // pending, running, completed, failed
      { name: 'params', type: 'jsonb', nullable: true },          // Query parameters
      { name: 'items_found', type: 'integer', default: 0 },
      { name: 'items_new', type: 'integer', default: 0 },
      { name: 'items_skipped', type: 'integer', default: 0 },
      { name: 'error_message', type: 'text', nullable: true },
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['source', 'status'] },
      { columns: ['created_at'] }
    ]
  },

  // ============================================
  // AI ENRICHMENT
  // ============================================

  enriched_profiles: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'crawled_data_id', type: 'uuid', nullable: false }, // Reference to crawled_data
      { name: 'source', type: 'string', nullable: false },        // 'github', 'hackernews'
      { name: 'type', type: 'string', nullable: false },          // 'profile', 'job_post'
      { name: 'structured_data', type: 'jsonb', nullable: false }, // AI-extracted structured fields
      { name: 'summary', type: 'text', nullable: true },          // AI-generated summary
      { name: 'embedding_id', type: 'string', nullable: true },   // Qdrant point ID
      { name: 'unified_entity_id', type: 'uuid', nullable: true }, // Reference to unified_entities
      { name: 'enriched_at', type: 'timestamptz', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['crawled_data_id'], unique: true },
      { columns: ['source', 'type'] },
      { columns: ['enriched_at'] },
      { columns: ['unified_entity_id'] }
    ]
  },

  // ============================================
  // ENTITY RESOLUTION
  // ============================================

  unified_entities: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'entity_type', type: 'string', nullable: false },   // 'person' | 'company'
      { name: 'canonical_name', type: 'string', nullable: false }, // Best name from sources
      { name: 'normalized_email', type: 'string', nullable: true }, // Normalized email (unique)
      { name: 'normalized_github', type: 'string', nullable: true }, // GitHub username normalized
      { name: 'normalized_twitter', type: 'string', nullable: true }, // Twitter handle normalized
      { name: 'normalized_linkedin', type: 'string', nullable: true }, // LinkedIn URL normalized
      { name: 'location', type: 'string', nullable: true },
      { name: 'company', type: 'string', nullable: true },
      { name: 'merged_data', type: 'jsonb', default: '{}' },       // Combined structured data from all sources
      { name: 'source_count', type: 'integer', default: 1 },       // Number of linked sources
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['entity_type'] },
      { columns: ['normalized_email'], unique: true },
      { columns: ['normalized_github'], unique: true },
      { columns: ['normalized_twitter'], unique: true },
      { columns: ['normalized_linkedin'], unique: true },
      { columns: ['canonical_name'] },
      { columns: ['source_count'] },
      { columns: ['created_at'] }
    ]
  },

  entity_source_links: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'unified_entity_id', type: 'uuid', nullable: false }, // Reference to unified_entities
      { name: 'enriched_profile_id', type: 'uuid', nullable: false }, // Reference to enriched_profiles
      { name: 'match_type', type: 'string', nullable: false },     // 'email' | 'github' | 'twitter' | 'linkedin' | 'name_location' | 'semantic'
      { name: 'confidence_score', type: 'numeric', nullable: false }, // 0-1 confidence score
      { name: 'linked_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['unified_entity_id'] },
      { columns: ['enriched_profile_id'], unique: true }, // Each profile links to one entity
      { columns: ['match_type'] },
      { columns: ['confidence_score'] }
    ]
  },

  // ============================================
  // INTELLIGENCE LAYER
  // ============================================

  entity_scores: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'unified_entity_id', type: 'uuid', nullable: false },       // Reference to unified_entities (one score per entity)
      { name: 'completeness_score', type: 'numeric', default: 0 },        // 0-100
      { name: 'activity_score', type: 'numeric', default: 0 },            // 0-100
      { name: 'availability_score', type: 'numeric', default: 0 },        // 0-100
      { name: 'quality_score', type: 'numeric', default: 0 },             // 0-100
      { name: 'score_breakdown', type: 'jsonb', default: '{}' },          // Detailed per-dimension breakdown
      { name: 'scored_at', type: 'timestamptz', default: 'now()' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['unified_entity_id'], unique: true },
      { columns: ['quality_score'] },
      { columns: ['completeness_score'] },
      { columns: ['activity_score'] },
      { columns: ['availability_score'] },
      { columns: ['scored_at'] }
    ]
  },

  match_results: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'job_enriched_profile_id', type: 'uuid', nullable: false }, // enriched_profiles record (type=job_post)
      { name: 'developer_entity_id', type: 'uuid', nullable: false },    // unified_entities record (developer)
      { name: 'vector_similarity', type: 'numeric', default: 0 },        // Qdrant cosine score
      { name: 'rule_score', type: 'numeric', default: 0 },               // Rule-based filter score 0-1
      { name: 'composite_score', type: 'numeric', default: 0 },          // Final combined score 0-1
      { name: 'match_breakdown', type: 'jsonb', default: '{}' },         // Skill overlap, seniority match, etc.
      { name: 'status', type: 'string', default: 'active' },             // active | dismissed | contacted
      { name: 'matched_at', type: 'timestamptz', default: 'now()' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['job_enriched_profile_id'] },
      { columns: ['developer_entity_id'] },
      { columns: ['composite_score'] },
      { columns: ['job_enriched_profile_id', 'developer_entity_id'], unique: true },
      { columns: ['status'] }
    ]
  },

  // ============================================
  // PIPELINE CHAINING
  // ============================================

  pipeline_runs: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'status', type: 'string', default: 'pending' },        // pending, running, completed, failed
      { name: 'config', type: 'jsonb', default: '{}' },               // Run parameters (source, type, urlTypes, etc.)
      { name: 'profiles_scanned', type: 'integer', default: 0 },
      { name: 'urls_discovered', type: 'integer', default: 0 },
      { name: 'urls_already_crawled', type: 'integer', default: 0 },
      { name: 'urls_new', type: 'integer', default: 0 },
      { name: 'items_crawled', type: 'integer', default: 0 },
      { name: 'items_enriched', type: 'integer', default: 0 },
      { name: 'items_failed', type: 'integer', default: 0 },
      { name: 'discovered_urls', type: 'jsonb', default: '[]' },      // Array of { url, type, sourceProfileId }
      { name: 'error_message', type: 'text', nullable: true },
      { name: 'auto_enrich', type: 'boolean', default: true },
      { name: 'pipeline_type', type: 'string', default: 'chain' },        // 'chain' | 'jobs' | 'profiles'
      { name: 'current_stage', type: 'string', default: 'pending' },      // pending | CRAWL | ENRICH | RESOLVE | CHAIN_CRAWL | CHAIN_ENRICH | CHAIN_RESOLVE | COMPLETED
      { name: 'stage_data', type: 'jsonb', default: '{}' },               // Per-stage tracking data
      { name: 'items_to_enrich', type: 'integer', default: 0 },           // Total items queued for enrichment (completion tracking)
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['status'] },
      { columns: ['pipeline_type'] },
      { columns: ['created_at'] }
    ]
  },

  // ============================================
  // OUTREACH ENGINE
  // ============================================

  outreach_campaigns: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'string', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'template_subject', type: 'string', nullable: false },   // Email subject with {{vars}}
      { name: 'template_html', type: 'text', nullable: false },        // Email body HTML with {{vars}}
      { name: 'template_text', type: 'text', nullable: true },         // Plain text fallback
      { name: 'from_address', type: 'string', nullable: true },        // Override SES default
      { name: 'from_name', type: 'string', nullable: true },
      { name: 'reply_to', type: 'string', nullable: true },
      { name: 'target_filters', type: 'jsonb', default: '{}' },        // Entity filters (skills, location, source, etc.)
      { name: 'status', type: 'string', default: 'draft' },            // draft | active | paused | completed
      { name: 'total_recipients', type: 'integer', default: 0 },
      { name: 'sent_count', type: 'integer', default: 0 },
      { name: 'opened_count', type: 'integer', default: 0 },
      { name: 'clicked_count', type: 'integer', default: 0 },
      { name: 'unsubscribed_count', type: 'integer', default: 0 },
      { name: 'bounced_count', type: 'integer', default: 0 },
      { name: 'created_by', type: 'string', nullable: true },          // Admin user ID
      { name: 'scheduled_at', type: 'timestamptz', nullable: true },
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['status'] },
      { columns: ['created_by'] },
      { columns: ['created_at'] }
    ]
  },

  outreach_recipients: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'campaign_id', type: 'uuid', nullable: false },          // Reference to outreach_campaigns
      { name: 'unified_entity_id', type: 'uuid', nullable: true },     // Reference to unified_entities
      { name: 'email', type: 'string', nullable: false },
      { name: 'name', type: 'string', nullable: true },
      { name: 'personalization_data', type: 'jsonb', default: '{}' },  // Per-recipient template vars
      { name: 'tracking_token', type: 'string', nullable: false },     // 64-char hex for tracking
      { name: 'status', type: 'string', default: 'pending' },          // pending | queued | sent | delivered | opened | clicked | bounced | unsubscribed
      { name: 'sent_at', type: 'timestamptz', nullable: true },
      { name: 'opened_at', type: 'timestamptz', nullable: true },
      { name: 'clicked_at', type: 'timestamptz', nullable: true },
      { name: 'bounced_at', type: 'timestamptz', nullable: true },
      { name: 'unsubscribed_at', type: 'timestamptz', nullable: true },
      { name: 'error_message', type: 'string', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['campaign_id'] },
      { columns: ['unified_entity_id'] },
      { columns: ['email'] },
      { columns: ['tracking_token'], unique: true },
      { columns: ['status'] },
      { columns: ['campaign_id', 'email'], unique: true }              // Prevent duplicate recipients per campaign
    ]
  },

  outreach_events: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'recipient_id', type: 'uuid', nullable: false },         // Reference to outreach_recipients
      { name: 'campaign_id', type: 'uuid', nullable: false },          // Reference to outreach_campaigns
      { name: 'event_type', type: 'string', nullable: false },         // sent | delivered | opened | clicked | bounced | unsubscribed
      { name: 'metadata', type: 'jsonb', default: '{}' },              // Click URL, user agent, IP, etc.
      { name: 'created_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['recipient_id'] },
      { columns: ['campaign_id'] },
      { columns: ['event_type'] },
      { columns: ['created_at'] }
    ]
  },

  email_blocklist: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'email', type: 'string', nullable: false },              // Blocked email address
      { name: 'reason', type: 'string', nullable: false },             // unsubscribed | bounced | manual | complaint
      { name: 'source_campaign_id', type: 'uuid', nullable: true },    // Campaign that triggered the block
      { name: 'blocked_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['email'], unique: true },
      { columns: ['reason'] }
    ]
  },

  // ============================================
  // INVOICING & TAX DOCUMENTS
  // ============================================

  invoices: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'invoice_number', type: 'string', nullable: false }, // UNIQUE, sequential: INV-2026-00001
      { name: 'project_id', type: 'uuid', nullable: false },
      { name: 'milestone_id', type: 'uuid', nullable: true },
      { name: 'payment_id', type: 'uuid', nullable: true },
      { name: 'client_id', type: 'string', nullable: false }, // payer user ID
      { name: 'contractor_id', type: 'string', nullable: false }, // payee user ID
      { name: 'amount', type: 'numeric', nullable: false },
      { name: 'currency', type: 'string', default: 'USD' },
      { name: 'tax_amount', type: 'numeric', default: 0 },
      { name: 'tax_withholding_percent', type: 'numeric', default: 0 },
      { name: 'issue_date', type: 'timestamptz', default: 'now()' },
      { name: 'due_date', type: 'timestamptz', nullable: true },
      { name: 'paid_at', type: 'timestamptz', nullable: true },
      { name: 'status', type: 'string', default: 'paid' }, // draft, sent, paid, cancelled
      { name: 'line_items', type: 'jsonb', default: '[]' },
      { name: 'client_details', type: 'jsonb', default: '{}' },
      { name: 'contractor_details', type: 'jsonb', default: '{}' },
      { name: 'payment_method', type: 'string', nullable: true },
      { name: 'payment_reference', type: 'string', nullable: true }, // Stripe charge ID
      { name: 'notes', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['invoice_number'], unique: true },
      { columns: ['project_id'] },
      { columns: ['client_id'] },
      { columns: ['contractor_id'] },
      { columns: ['milestone_id'] },
      { columns: ['payment_id'] },
      { columns: ['status'] },
      { columns: ['issue_date'] }
    ]
  },

  contractor_tax_info: {
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'string', nullable: false },
      { name: 'legal_name', type: 'string', nullable: false },
      { name: 'country', type: 'string', nullable: false },
      { name: 'tax_id_encrypted', type: 'text', nullable: true },
      { name: 'form_type', type: 'string', default: 'W-8BEN' }, // W-8BEN or W-9
      { name: 'submitted_at', type: 'timestamptz', default: 'now()' },
      { name: 'verified', type: 'boolean', default: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' }
    ],
    indexes: [
      { columns: ['user_id'] },
      { columns: ['form_type'] }
    ]
  }
};
