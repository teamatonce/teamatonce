/**
 * Escrow System Type Definitions
 * Team@Once Platform - Secure Payment Escrow
 */

/**
 * Escrow status for milestone payments
 */
export type EscrowStatus =
  | 'unfunded'          // Initial state, no funds deposited
  | 'funded'            // Client has deposited funds
  | 'work_in_progress'  // Developer working on milestone
  | 'submitted'         // Deliverables submitted for review
  | 'changes_requested' // Client requested changes
  | 'approved'          // Client approved deliverables
  | 'released'          // Funds released to developer
  | 'disputed'          // In dispute resolution
  | 'refunded'          // Funds refunded to client
  | 'expired';          // Escrow period expired

/**
 * Dispute status
 */
export type DisputeStatus =
  | 'open'              // Dispute opened
  | 'investigating'     // Under investigation
  | 'mediation'         // In mediation process
  | 'resolved'          // Resolved
  | 'closed';           // Closed

/**
 * Deliverable type
 */
export type DeliverableType =
  | 'code'              // Source code
  | 'design'            // Design files
  | 'documentation'     // Documentation
  | 'binary'            // Compiled/binary files
  | 'other';            // Other files

/**
 * Timeline event type
 */
export type TimelineEventType =
  | 'funded'
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'released'
  | 'disputed'
  | 'dispute_resolved'
  | 'refunded'
  | 'deadline_extended';

/**
 * Milestone deliverable interface
 */
export interface MilestoneDeliverable {
  id: string;
  milestoneId: string;
  paymentId: string;
  developerId: string;
  files: string[];                    // Array of file URLs/paths
  description: string;
  deliverableType: DeliverableType;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Payment dispute interface
 */
export interface PaymentDispute {
  id: string;
  paymentId: string;
  milestoneId: string;
  projectId: string;
  raisedBy: string;                   // User ID who raised dispute
  raisedByRole: 'client' | 'developer';
  reason: string;
  description: string;
  evidence: DisputeEvidence[];
  status: DisputeStatus;
  resolution?: string;
  resolvedBy?: string;                // Admin/mediator user ID
  resolvedAt?: Date;
  resolutionAction?: 'release' | 'refund' | 'partial_release' | 'hold';
  partialAmount?: number;             // For partial releases
  mediationStartedAt?: Date;
  mediationAcceptedBy?: string[];     // User IDs who accepted mediation
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Dispute evidence
 */
export interface DisputeEvidence {
  id: string;
  disputeId: string;
  uploadedBy: string;
  uploadedByRole: 'client' | 'developer' | 'admin';
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description?: string;
  uploadedAt: Date;
}

/**
 * Escrow timeline event
 */
export interface EscrowTimelineEvent {
  id: string;
  paymentId: string;
  eventType: TimelineEventType;
  performedBy: string;                // User ID
  performedByName: string;
  performedByRole: 'client' | 'developer' | 'admin' | 'system';
  description: string;
  metadata?: Record<string, any>;     // Additional event data
  amount?: number;                    // For payment events
  previousDeadline?: Date;            // For deadline extensions
  newDeadline?: Date;                 // For deadline extensions
  createdAt: Date;
}

/**
 * Escrow account balance
 */
export interface EscrowBalance {
  userId: string;
  role: 'client' | 'developer';
  totalFunded: number;                // Total amount funded (client)
  totalEarned: number;                // Total amount earned (developer)
  inEscrow: number;                   // Currently in escrow
  releasable: number;                 // Ready to be released
  pending: number;                    // Pending review
  disputed: number;                   // In dispute
  currency: string;
  lastUpdated: Date;
}

/**
 * Stripe Connect account status
 */
export interface StripeConnectStatus {
  hasAccount: boolean;
  accountId?: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    pendingVerification: string[];
  };
  capabilities?: {
    transfers: 'active' | 'inactive' | 'pending';
    card_payments: 'active' | 'inactive' | 'pending';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * DTOs for API calls
 */

export interface FundMilestoneDto {
  milestoneId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
}

export interface SubmitDeliverablesDto {
  milestoneId: string;
  files: string[];
  description: string;
  deliverableType: DeliverableType;
}

export interface ApproveDeliverableDto {
  milestoneId: string;
  reviewNotes?: string;
}

export interface RequestChangesDto {
  milestoneId: string;
  changeNotes: string;
  extendDays: number;
}

export interface MilestoneStatusDto {
  milestoneId: string;
  paymentId: string;
  status: EscrowStatus;
  amount: number;
  currency: string;
  fundedAt?: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  releasedAt?: Date;
  deadline?: Date;
  deliverable?: MilestoneDeliverable;
  dispute?: PaymentDispute;
  canSubmit: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  canDispute: boolean;
}

export interface CreateConnectAccountDto {
  email: string;
  country: string;
}

export interface ConnectAccountLinkDto {
  url: string;
  expiresAt: Date;
}

/**
 * Escrow statistics
 */
export interface EscrowStats {
  projectId?: string;
  totalMilestones: number;
  fundedMilestones: number;
  completedMilestones: number;
  disputedMilestones: number;
  totalValue: number;
  inEscrow: number;
  released: number;
  disputed: number;
  averageTimeToApproval: number;      // in hours
  approvalRate: number;               // percentage
  disputeRate: number;                // percentage
  currency: string;
}

/**
 * Milestone payment summary
 */
export interface MilestonePaymentSummary {
  milestoneId: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  dueDate: Date;
  fundedAt?: Date;
  completedAt?: Date;
  isOverdue: boolean;
  daysUntilDue: number;
  deliverableCount: number;
  hasDispute: boolean;
}
