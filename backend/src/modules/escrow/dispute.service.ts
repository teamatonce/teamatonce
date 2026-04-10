import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StripeService } from '../payment/stripe.service';
import { TeamAtOnceGateway } from '../../websocket/teamatonce.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/dto';
import * as Stripe from 'stripe';

/**
 * Dispute Resolution Service
 *
 * Handles the complete dispute resolution workflow for escrow payments.
 * Implements a 4-phase dispute resolution system:
 *
 * Phase 1: Dispute Opening (0 days) - Either party can open a dispute
 * Phase 2: Negotiation Period (7 days) - Both parties provide evidence
 * Phase 3: Platform Mediation (2 days) - Admin reviews and decides split
 * Phase 4: Resolution Acceptance (2 days) - Parties accept or auto-execute
 *
 * Timeline: 0 → 7 → 9 → 11 days total
 *
 * Based on industry standards (Upwork, Deel) with automated escalation.
 */
@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly stripeService: StripeService,
    private readonly wsGateway: TeamAtOnceGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================
  // PHASE 1: DISPUTE OPENING
  // ============================================

  /**
   * Open a dispute on an escrow payment (DTO wrapper)
   */
  async openDispute(userId: string, dto: any) {
    // Determine user role from the project
    const milestone = await this.db.findOne('project_milestones', { id: dto.milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const project = await this.db.findOne('projects', { id: milestone.project_id });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const userRole: 'client' | 'seller' = project.client_id === userId ? 'client' : 'seller';

    return this.openDisputeInternal(
      dto.milestoneId,
      userId,
      userRole,
      dto.reason,
      dto.description,
      dto.evidence || [],
    );
  }

  /**
   * Open a dispute on an escrow payment (internal implementation)
   *
   * Either client OR developer can initiate a dispute.
   * Sets up the complete dispute resolution timeline.
   *
   * @param milestoneId - ID of the milestone being disputed
   * @param userId - User ID of the party opening the dispute
   * @param userRole - Role of the disputing party ('client' or 'seller')
   * @param reason - Reason code for dispute
   * @param description - Detailed description of the dispute
   * @param evidenceFiles - Array of evidence file URLs
   */
  private async openDisputeInternal(
    milestoneId: string,
    userId: string,
    userRole: 'client' | 'seller',
    reason: string,
    description: string,
    evidenceFiles: string[] = []
  ) {
    this.logger.log(`Opening dispute for milestone ${milestoneId} by ${userRole}`);

    // Validate dispute can be opened
    await this.canOpenDispute(milestoneId);

    // Get payment record
    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    if (!payment) {
      throw new NotFoundException('Payment not found for milestone');
    }

    // Verify payment is in escrow and held status
    if (payment.escrow_status !== 'held' && payment.escrow_status !== 'authorized') {
      throw new BadRequestException(
        `Cannot dispute payment with status: ${payment.escrow_status}. Must be 'held' or 'authorized'.`
      );
    }

    // Calculate dispute timeline deadlines
    const now = new Date();

    // Negotiation period: 7 days from dispute opening
    const negotiationDeadline = new Date(now);
    negotiationDeadline.setDate(now.getDate() + 7);

    // Mediation period: +2 days after negotiation (day 9)
    const mediationDeadline = new Date(negotiationDeadline);
    mediationDeadline.setDate(negotiationDeadline.getDate() + 2);

    // Response period: +2 days after mediation (day 11)
    const responseDeadline = new Date(mediationDeadline);
    responseDeadline.setDate(mediationDeadline.getDate() + 2);

    // Create dispute record
    const dispute = await this.db.insert('payment_disputes', {
      payment_id: payment.id,
      milestone_id: milestoneId,
      project_id: payment.project_id,
      dispute_reason: reason,
      dispute_description: description,
      disputed_by: userId,
      disputed_by_role: userRole,
      dispute_amount: payment.amount,
      evidence_files: JSON.stringify(evidenceFiles),
      evidence_description: '',
      status: 'open',
      negotiation_deadline: negotiationDeadline.toISOString(),
      mediation_deadline: mediationDeadline.toISOString(),
      response_deadline: responseDeadline.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update payment escrow status to disputed
    await this.db.update('payments', payment.id, {
      escrow_status: 'disputed',
      status: 'disputed',
      updated_at: new Date().toISOString(),
    });

    // Update milestone status
    await this.db.update('project_milestones', milestoneId, {
      status: 'disputed',
      updated_at: new Date().toISOString(),
    });

    // Create timeline event for audit trail
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: milestoneId,
      dispute_id: dispute.id,
      event_type: 'dispute_opened',
      event_description: `${userRole.toUpperCase()} opened dispute: ${reason}`,
      triggered_by: userId,
      triggered_by_role: userRole,
      event_data: {
        reason,
        description,
        evidence_count: evidenceFiles.length,
        negotiation_deadline: negotiationDeadline.toISOString(),
        mediation_deadline: mediationDeadline.toISOString(),
        response_deadline: responseDeadline.toISOString(),
      },
    });

    this.logger.log(`Dispute ${dispute.id} created successfully`);

    // Send notifications to both parties
    await this.notifyDisputeOpened(dispute, payment.project_id, userRole, reason);

    return {
      success: true,
      dispute,
      timeline: {
        negotiationDeadline,
        mediationDeadline,
        responseDeadline,
      },
      message: `Dispute opened. Both parties have until ${negotiationDeadline.toLocaleDateString()} to negotiate and provide evidence.`,
    };
  }

  // ============================================
  // PHASE 2: NEGOTIATION & EVIDENCE SUBMISSION
  // ============================================

  /**
   * Respond to a dispute with evidence (DTO wrapper)
   */
  async respondToDispute(disputeId: string, userId: string, dto: any) {
    return this.respondToDisputeInternal(
      disputeId,
      userId,
      dto.response,
      dto.evidence || [],
    );
  }

  /**
   * Respond to a dispute with evidence (internal implementation)
   *
   * The other party (opposite of who opened the dispute) can respond
   * with their evidence and explanation during the negotiation period.
   * Can be called multiple times to add more evidence.
   *
   * @param disputeId - ID of the dispute
   * @param userId - User ID responding
   * @param responseText - Response explanation
   * @param responseFiles - Additional evidence files
   */
  private async respondToDisputeInternal(
    disputeId: string,
    userId: string,
    responseText: string,
    responseFiles: string[] = []
  ) {
    this.logger.log(`User ${userId} responding to dispute ${disputeId}`);

    const dispute = await this.getDisputeById(disputeId);

    // Validate user can respond
    if (!this.canRespond(dispute, userId)) {
      throw new BadRequestException('You are not authorized to respond to this dispute');
    }

    // Check dispute is in a state that accepts responses
    if (dispute.status !== 'open' && dispute.status !== 'negotiating') {
      throw new BadRequestException(
        `Cannot respond to dispute with status: ${dispute.status}. Must be 'open' or 'negotiating'.`
      );
    }

    // Check if still within negotiation period
    const now = new Date();
    const negotiationDeadline = new Date(dispute.negotiation_deadline);
    if (now > negotiationDeadline) {
      throw new BadRequestException('Negotiation period has ended. Dispute is being escalated to mediation.');
    }

    // Merge existing response files with new ones
    const existingFiles = dispute.response_files ? JSON.parse(dispute.response_files as string) : [];
    const allFiles = [...existingFiles, ...responseFiles];

    // Update dispute with response
    await this.db.update('payment_disputes', disputeId, {
      response_text: responseText,
      response_files: JSON.stringify(allFiles),
      responded_by: userId,
      responded_at: new Date().toISOString(),
      status: 'negotiating', // Move to negotiating status
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: dispute.payment_id,
      milestone_id: dispute.milestone_id,
      dispute_id: disputeId,
      event_type: 'dispute_response_submitted',
      event_description: 'Other party submitted response and evidence',
      triggered_by: userId,
      triggered_by_role: userId === dispute.disputed_by ? dispute.disputed_by_role :
                         (dispute.disputed_by_role === 'client' ? 'seller' : 'client'),
      event_data: {
        response_text: responseText.substring(0, 200), // First 200 chars for summary
        evidence_count: allFiles.length,
        new_files_count: responseFiles.length,
      },
    });

    this.logger.log(`Dispute ${disputeId} response recorded`);

    return {
      success: true,
      message: 'Response submitted successfully. Platform will review for mediation if no agreement is reached.',
      disputeStatus: 'negotiating',
      negotiationDeadline: dispute.negotiation_deadline,
    };
  }

  // ============================================
  // PHASE 3: PLATFORM MEDIATION
  // ============================================

  /**
   * Mediate a dispute and determine resolution (DTO wrapper)
   */
  async mediateDispute(disputeId: string, userId: string, dto: any) {
    return this.mediateDisputeInternal(
      disputeId,
      userId,
      dto.developerPercentage,
      dto.mediationNotes,
    );
  }

  /**
   * Mediate a dispute and determine resolution (internal implementation)
   *
   * Platform admin reviews all evidence from both parties and makes
   * a binding decision on how to split the escrow payment.
   *
   * @param disputeId - ID of the dispute
   * @param mediatorId - Admin user ID performing mediation
   * @param mediationPercentage - Percentage to release to developer (0-100)
   * @param notes - Mediation decision notes
   */
  private async mediateDisputeInternal(
    disputeId: string,
    mediatorId: string,
    mediationPercentage: number,
    notes: string
  ) {
    this.logger.log(`Mediating dispute ${disputeId} by admin ${mediatorId}`);

    // Validate mediator has admin role
    if (!await this.isMediator(mediatorId)) {
      throw new BadRequestException('Only platform administrators can mediate disputes');
    }

    const dispute = await this.getDisputeById(disputeId);

    // Validate mediation percentage
    if (mediationPercentage < 0 || mediationPercentage > 100) {
      throw new BadRequestException('Mediation percentage must be between 0 and 100');
    }

    // Get payment to calculate amounts
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Calculate resolution amounts
    // Developer gets mediationPercentage of net_amount (after platform fee)
    const releaseAmount = Math.round((payment.net_amount * mediationPercentage) / 100 * 100) / 100;

    // Client gets refund of: total paid - platform fee - release amount
    const refundAmount = Math.round((payment.amount - payment.platform_fee - releaseAmount) * 100) / 100;

    // Determine mediation decision category
    let decision: string;
    if (mediationPercentage === 100) {
      decision = 'developer_favor'; // Full release to developer
    } else if (mediationPercentage === 0) {
      decision = 'client_favor'; // Full refund to client
    } else {
      decision = 'split'; // Partial split
    }

    // Update dispute with mediation decision
    await this.db.update('payment_disputes', disputeId, {
      mediator_id: mediatorId,
      mediation_notes: notes,
      mediation_decision: decision,
      mediation_percentage: mediationPercentage,
      mediated_at: new Date().toISOString(),
      status: 'mediation', // Move to mediation status
      release_amount: releaseAmount,
      refund_amount: refundAmount,
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: dispute.milestone_id,
      dispute_id: disputeId,
      event_type: 'mediation_decision',
      event_description: `Platform mediation decision: ${mediationPercentage}% to developer (${decision})`,
      triggered_by: mediatorId,
      triggered_by_role: 'admin',
      event_data: {
        decision,
        percentage: mediationPercentage,
        release_amount: releaseAmount,
        refund_amount: refundAmount,
        mediation_notes: notes,
      },
    });

    this.logger.log(`Dispute ${disputeId} mediated: ${mediationPercentage}% to developer`);

    // Notify both parties of mediation decision
    await this.notifyMediationDecision(dispute, decision, mediationPercentage, releaseAmount, refundAmount);

    return {
      success: true,
      decision,
      mediationPercentage,
      releaseAmount,
      refundAmount,
      responseDeadline: dispute.response_deadline,
      message: `Mediation complete. Decision: ${mediationPercentage}% to developer. Parties have until ${new Date(dispute.response_deadline).toLocaleDateString()} to accept or it will be auto-executed.`,
    };
  }

  // ============================================
  // PHASE 4: ACCEPTANCE & EXECUTION
  // ============================================

  /**
   * Accept mediation decision (DTO wrapper)
   */
  async acceptMediation(disputeId: string, userId: string, dto: any) {
    // Determine user role from the dispute
    const dispute = await this.getDisputeById(disputeId);
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    const milestone = await this.db.findOne('project_milestones', { id: payment.milestone_id });
    const project = await this.db.findOne('projects', { id: milestone.project_id });

    const userRole: 'client' | 'seller' = project.client_id === userId ? 'client' : 'seller';

    return this.acceptMediationInternal(disputeId, userId, userRole);
  }

  /**
   * Accept mediation decision (internal implementation)
   *
   * Either party can accept the mediation decision.
   * If both accept OR deadline passes, resolution is executed.
   *
   * @param disputeId - ID of the dispute
   * @param userId - User ID accepting the decision
   * @param userRole - Role of the accepting party
   */
  private async acceptMediationInternal(
    disputeId: string,
    userId: string,
    userRole: 'client' | 'seller'
  ) {
    this.logger.log(`${userRole} ${userId} accepting mediation for dispute ${disputeId}`);

    const dispute = await this.getDisputeById(disputeId);

    // Verify dispute is in mediation status
    if (dispute.status !== 'mediation') {
      throw new BadRequestException('Dispute must be in mediation status to accept decision');
    }

    // Record acceptance in metadata
    const metadata = dispute.metadata ? JSON.parse(dispute.metadata as string) : {};
    metadata[`${userRole}_accepted`] = true;
    metadata[`${userRole}_accepted_at`] = new Date().toISOString();

    await this.db.update('payment_disputes', disputeId, {
      metadata: JSON.stringify(metadata),
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: dispute.payment_id,
      milestone_id: dispute.milestone_id,
      dispute_id: disputeId,
      event_type: 'mediation_accepted',
      event_description: `${userRole.toUpperCase()} accepted mediation decision`,
      triggered_by: userId,
      triggered_by_role: userRole,
      event_data: {
        accepted_by: userRole,
      },
    });

    // Check if both parties accepted OR if deadline passed
    const bothAccepted = metadata.client_accepted && metadata.developer_accepted;
    const deadlinePassed = new Date() > new Date(dispute.response_deadline);

    if (bothAccepted || deadlinePassed) {
      // Execute resolution immediately
      this.logger.log(`Both parties accepted or deadline passed. Executing resolution for dispute ${disputeId}`);
      return await this.executeDisputeResolution(disputeId);
    }

    return {
      success: true,
      message: `Mediation accepted by ${userRole}. Waiting for other party to accept or deadline to pass.`,
      waitingFor: userRole === 'client' ? 'seller' : 'client',
      responseDeadline: dispute.response_deadline,
    };
  }

  /**
   * Execute the dispute resolution
   *
   * This is the final step that processes the Stripe payment based on
   * the mediation decision. Handles full release, full refund, or partial split.
   *
   * @param disputeId - ID of the dispute to resolve
   */
  async executeDisputeResolution(disputeId: string) {
    this.logger.log(`Executing dispute resolution for ${disputeId}`);

    const dispute = await this.getDisputeById(disputeId);

    // Get payment details
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify mediation decision exists
    if (dispute.mediation_percentage === null || dispute.mediation_percentage === undefined) {
      throw new BadRequestException('Mediation decision must be made before executing resolution');
    }

    const percentage = dispute.mediation_percentage;
    const stripe = this.stripeService.getClient();

    try {
      // Get the PaymentIntent
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);

      if (paymentIntent.status !== 'requires_capture') {
        this.logger.warn(`PaymentIntent ${paymentIntent.id} status is ${paymentIntent.status}, expected requires_capture`);
      }

      let stripeAction: string;
      let resolution: string;

      if (percentage === 100) {
        // Full release to developer - capture entire payment
        this.logger.log(`Full release (100%) - capturing full payment`);
        await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
        stripeAction = 'full_capture';
        resolution = 'full_release';

      } else if (percentage === 0) {
        // Full refund to client - cancel payment intent
        this.logger.log(`Full refund (0%) - canceling payment intent`);
        await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
        stripeAction = 'full_cancel';
        resolution = 'full_refund';

      } else {
        // Partial split - capture partial amount
        const totalAmountCents = payment.amount * 100; // Convert to cents
        const captureAmountCents = Math.round((totalAmountCents * percentage) / 100);

        this.logger.log(`Partial split (${percentage}%) - capturing ${captureAmountCents} cents of ${totalAmountCents} cents`);

        await stripe.paymentIntents.capture(payment.stripe_payment_intent_id, {
          amount_to_capture: captureAmountCents,
        });
        // Remaining amount is automatically refunded by Stripe
        stripeAction = 'partial_capture';
        resolution = 'partial_refund';
      }

      // Update dispute as resolved
      await this.db.update('payment_disputes', disputeId, {
        status: 'resolved',
        resolution,
        resolved_at: new Date().toISOString(),
        resolution_notes: `Resolution executed via Stripe: ${stripeAction}`,
        refund_processed_at: percentage < 100 ? new Date().toISOString() : null,
        release_processed_at: percentage > 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });

      // Update payment status
      const newEscrowStatus = percentage === 100 ? 'released' :
                             percentage === 0 ? 'refunded' :
                             'partially_released';

      await this.db.update('payments', payment.id, {
        status: 'completed',
        escrow_status: newEscrowStatus,
        escrow_released_at: percentage > 0 ? new Date().toISOString() : null,
        escrow_refunded_at: percentage < 100 ? new Date().toISOString() : null,
        transaction_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update milestone status
      const milestoneStatus = percentage === 100 ? 'approved' :
                             percentage === 0 ? 'rejected' :
                             'partially_approved';

      await this.db.update('project_milestones', dispute.milestone_id, {
        status: milestoneStatus,
        updated_at: new Date().toISOString(),
      });

      // Create timeline event
      await this.createTimelineEvent({
        payment_id: payment.id,
        milestone_id: dispute.milestone_id,
        dispute_id: disputeId,
        event_type: 'dispute_resolved',
        event_description: `Dispute resolved: ${percentage}% to developer, ${100 - percentage}% refunded to client`,
        triggered_by: 'system',
        triggered_by_role: 'system',
        event_data: {
          resolution,
          release_percentage: percentage,
          refund_percentage: 100 - percentage,
          stripe_action: stripeAction,
          release_amount: dispute.release_amount,
          refund_amount: dispute.refund_amount,
        },
      });

      this.logger.log(`Dispute ${disputeId} resolved successfully: ${resolution}`);

      // Notify both parties of the resolution
      await this.notifyDisputeResolved(dispute, resolution, percentage);

      return {
        success: true,
        resolution,
        releasePercentage: percentage,
        refundPercentage: 100 - percentage,
        releaseAmount: dispute.release_amount,
        refundAmount: dispute.refund_amount,
        stripeAction,
        message: `Dispute resolved. ${percentage}% released to developer, ${100 - percentage}% refunded to client.`,
      };

    } catch (error) {
      this.logger.error(`Failed to execute dispute resolution for ${disputeId}:`, error);

      // Record failure in timeline
      await this.createTimelineEvent({
        payment_id: payment.id,
        milestone_id: dispute.milestone_id,
        dispute_id: disputeId,
        event_type: 'resolution_failed',
        event_description: `Failed to execute resolution: ${error.message}`,
        triggered_by: 'system',
        triggered_by_role: 'system',
        event_data: {
          error: error.message,
          percentage,
        },
      });

      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get dispute by ID with validation
   */
  async getDisputeById(disputeId: string) {
    const dispute = await this.db.findOne('payment_disputes', { id: disputeId });
    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }
    return dispute;
  }

  /**
   * Get all disputes for a payment
   */
  async getDisputesByPayment(paymentId: string) {
    return await this.db.findMany('payment_disputes', { payment_id: paymentId });
  }

  /**
   * Get all disputes for a user
   */
  async getDisputesByUser(userId: string) {
    const clientDisputes = await this.db.findMany('payment_disputes', {
      disputed_by: userId,
      disputed_by_role: 'client',
    });

    const developerDisputes = await this.db.findMany('payment_disputes', {
      disputed_by: userId,
      disputed_by_role: 'seller',
    });

    return [...clientDisputes, ...developerDisputes];
  }

  /**
   * Validate if dispute can be opened
   */
  async canOpenDispute(milestoneId: string): Promise<boolean> {
    // Check if there's already an open dispute
    const existingDispute = await this.db.findOne('payment_disputes', {
      milestone_id: milestoneId,
      status: { $in: ['open', 'negotiating', 'mediation'] },
    });

    if (existingDispute) {
      throw new BadRequestException('An active dispute already exists for this milestone');
    }

    return true;
  }

  /**
   * Check if user can respond to dispute
   */
  canRespond(dispute: any, userId: string): boolean {
    // User can respond if they are NOT the one who opened the dispute
    // This ensures the other party can provide their evidence
    return userId !== dispute.disputed_by;
  }

  /**
   * Check if user is a platform mediator/admin
   */
  async isMediator(userId: string): Promise<boolean> {
    // TODO: Implement actual admin role check
    // For now, we'll do a basic check against a user's role or permissions
    // This should integrate with your actual auth/user system

    // Example implementation:
    // const user = await this.db.findOne('users', { id: userId });
    // return user?.role === 'admin' || user?.role === 'platform_admin';

    // For now, return true to allow testing
    // IMPORTANT: Replace this with actual admin check in production
    return true;
  }

  /**
   * Create timeline event for audit trail
   */
  private async createTimelineEvent(event: {
    payment_id: string;
    milestone_id?: string;
    dispute_id?: string;
    event_type: string;
    event_description: string;
    triggered_by: string;
    triggered_by_role: string;
    event_data?: any;
  }) {
    try {
      await this.db.insert('escrow_timeline_events', {
        payment_id: event.payment_id,
        milestone_id: event.milestone_id || null,
        dispute_id: event.dispute_id || null,
        event_type: event.event_type,
        event_description: event.event_description,
        event_data: JSON.stringify(event.event_data || {}),
        triggered_by: event.triggered_by,
        triggered_by_role: event.triggered_by_role,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to create timeline event:', error);
      // Don't throw - timeline events are for audit, shouldn't block operations
    }
  }

  /**
   * Get dispute statistics
   */
  async getDisputeStats() {
    // TODO: Implement aggregation queries for analytics
    // - Total disputes
    // - Resolution rates
    // - Average resolution time
    // - Success rates by decision type
    return {
      message: 'Dispute statistics not yet implemented',
    };
  }

  // ============================================
  // NOTIFICATION METHODS
  // ============================================

  /**
   * Send notification when a dispute is opened
   */
  private async notifyDisputeOpened(
    dispute: any,
    projectId: string,
    openedByRole: 'client' | 'seller',
    reason: string,
  ) {
    try {
      const project = await this.db.findOne('projects', { id: projectId });
      if (!project) {
        this.logger.warn(`Cannot send dispute notification: project ${projectId} not found`);
        return;
      }

      const clientId = project.client_id;
      const developerId = project.developer_id;
      const projectName = project.title || project.name;
      const deadlineDate = new Date(dispute.negotiation_deadline).toLocaleDateString();

      const notificationData = {
        disputeId: dispute.id,
        projectId,
        projectName,
        reason,
        openedBy: openedByRole,
        negotiationDeadline: dispute.negotiation_deadline,
      };

      // Notify client
      if (clientId) {
        await this.notificationsService.sendNotification({
          user_id: clientId,
          type: NotificationType.SECURITY,
          title: openedByRole === 'client' ? 'Dispute Opened' : 'Dispute Alert',
          message: openedByRole === 'client'
            ? `Your dispute for "${projectName}" has been submitted. The negotiation period ends on ${deadlineDate}.`
            : `The developer has opened a dispute for "${projectName}". Please review and respond within the negotiation period.`,
          priority: NotificationPriority.URGENT,
          action_url: `/project/${projectId}/dispute/${dispute.id}`,
          data: notificationData,
          send_push: true,
          send_email: true,
        });
      }

      // Notify developer
      if (developerId) {
        await this.notificationsService.sendNotification({
          user_id: developerId,
          type: NotificationType.SECURITY,
          title: openedByRole === 'seller' ? 'Dispute Opened' : 'Dispute Alert',
          message: openedByRole === 'seller'
            ? `Your dispute for "${projectName}" has been submitted. The negotiation period ends on ${deadlineDate}.`
            : `The client has opened a dispute for "${projectName}". Please review and respond within the negotiation period.`,
          priority: NotificationPriority.URGENT,
          action_url: `/project/${projectId}/dispute/${dispute.id}`,
          data: notificationData,
          send_push: true,
          send_email: true,
        });
      }

      // Also notify the project room via WebSocket for real-time update
      this.wsGateway.sendToProject(projectId, 'dispute-opened', notificationData);

      this.logger.log(`Dispute notifications sent for dispute ${dispute.id}`);
    } catch (error) {
      this.logger.error(`Failed to send dispute opened notifications: ${error.message}`);
    }
  }

  /**
   * Send notification when mediation decision is made
   */
  private async notifyMediationDecision(
    dispute: any,
    decision: string,
    percentage: number,
    releaseAmount: number,
    refundAmount: number,
  ) {
    try {
      const project = await this.db.findOne('projects', { id: dispute.project_id });
      if (!project) {
        this.logger.warn(`Cannot send mediation notification: project not found`);
        return;
      }

      const clientId = project.client_id;
      const developerId = project.developer_id;
      const projectName = project.title || project.name;
      const responseDate = new Date(dispute.response_deadline).toLocaleDateString();

      const notificationData = {
        disputeId: dispute.id,
        projectId: dispute.project_id,
        projectName,
        decision,
        developerPercentage: percentage,
        clientPercentage: 100 - percentage,
        releaseAmount,
        refundAmount,
        responseDeadline: dispute.response_deadline,
      };

      // Determine the decision description
      let decisionDescription: string;
      if (decision === 'developer_favor') {
        decisionDescription = 'in favor of the developer (100% release)';
      } else if (decision === 'client_favor') {
        decisionDescription = 'in favor of the client (100% refund)';
      } else {
        decisionDescription = `a split decision: ${percentage}% to developer, ${100 - percentage}% refunded`;
      }

      // Notify client
      if (clientId) {
        await this.notificationsService.sendNotification({
          user_id: clientId,
          type: NotificationType.FINANCE,
          title: 'Dispute Mediation Decision',
          message: `The platform has made a mediation decision ${decisionDescription}. You will receive a refund of $${refundAmount.toFixed(2)}. Please respond by ${responseDate}.`,
          priority: NotificationPriority.HIGH,
          action_url: `/project/${dispute.project_id}/dispute/${dispute.id}`,
          data: notificationData,
          send_push: true,
          send_email: true,
        });
      }

      // Notify developer
      if (developerId) {
        await this.notificationsService.sendNotification({
          user_id: developerId,
          type: NotificationType.FINANCE,
          title: 'Dispute Mediation Decision',
          message: `The platform has made a mediation decision ${decisionDescription}. You will receive $${releaseAmount.toFixed(2)}. Please respond by ${responseDate}.`,
          priority: NotificationPriority.HIGH,
          action_url: `/project/${dispute.project_id}/dispute/${dispute.id}`,
          data: notificationData,
          send_push: true,
          send_email: true,
        });
      }

      // Notify project room via WebSocket
      this.wsGateway.sendToProject(dispute.project_id, 'mediation-decision', notificationData);

      this.logger.log(`Mediation decision notifications sent for dispute ${dispute.id}`);
    } catch (error) {
      this.logger.error(`Failed to send mediation decision notifications: ${error.message}`);
    }
  }

  /**
   * Send notification when dispute is resolved
   */
  private async notifyDisputeResolved(
    dispute: any,
    resolution: string,
    releasePercentage: number,
  ) {
    try {
      const project = await this.db.findOne('projects', { id: dispute.project_id });
      if (!project) {
        return;
      }

      const clientId = project.client_id;
      const developerId = project.developer_id;
      const projectName = project.title || project.name;

      const notificationData = {
        disputeId: dispute.id,
        projectId: dispute.project_id,
        projectName,
        resolution,
        releasePercentage,
        refundPercentage: 100 - releasePercentage,
      };

      // Notify both parties using NotificationsService
      const userIds = [clientId, developerId].filter(Boolean);
      if (userIds.length > 0) {
        await this.notificationsService.sendNotification({
          user_ids: userIds,
          type: NotificationType.FINANCE,
          title: 'Dispute Resolved',
          message: `The dispute for "${projectName}" has been resolved. ${releasePercentage}% released to developer, ${100 - releasePercentage}% refunded to client.`,
          priority: NotificationPriority.HIGH,
          action_url: `/project/${dispute.project_id}/dispute/${dispute.id}`,
          data: notificationData,
          send_push: true,
          send_email: true,
        });
      }

      // Notify project room via WebSocket
      this.wsGateway.sendToProject(dispute.project_id, 'dispute-resolved', notificationData);

      this.logger.log(`Dispute resolved notifications sent for dispute ${dispute.id}`);
    } catch (error) {
      this.logger.error(`Failed to send dispute resolved notifications: ${error.message}`);
    }
  }

  /**
   * Get a single dispute by ID (alias for getDisputeById)
   */
  async getDispute(disputeId: string, userId: string) {
    const dispute = await this.getDisputeById(disputeId);

    // Verify user has access to this dispute
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    const milestone = await this.db.findOne('project_milestones', { id: payment.milestone_id });
    const project = await this.db.findOne('projects', { id: milestone.project_id });

    if (project.client_id !== userId && project.developer_id !== userId) {
      throw new NotFoundException('Dispute not found or access denied');
    }

    return dispute;
  }

  /**
   * Get all disputes for a specific milestone
   */
  async getMilestoneDisputes(milestoneId: string, userId: string) {
    // Verify user has access to this milestone
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const project = await this.db.findOne('projects', { id: milestone.project_id });
    if (project.client_id !== userId && project.developer_id !== userId) {
      throw new NotFoundException('Access denied to milestone disputes');
    }

    // Get payment for this milestone
    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    if (!payment) {
      return [];
    }

    return await this.getDisputesByPayment(payment.id);
  }

  /**
   * Manually escalate a dispute to mediation before negotiation period ends
   */
  async escalateDispute(disputeId: string, userId: string, reason: { reason: string }) {
    const dispute = await this.getDisputeById(disputeId);

    if (dispute.status !== 'negotiation') {
      throw new BadRequestException('Dispute can only be escalated during negotiation phase');
    }

    // Verify user is part of the dispute
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    const milestone = await this.db.findOne('project_milestones', { id: payment.milestone_id });
    const project = await this.db.findOne('projects', { id: milestone.project_id });

    if (project.client_id !== userId && project.developer_id !== userId) {
      throw new NotFoundException('Access denied');
    }

    // Update dispute status to mediation
    await this.db.update('payment_disputes', disputeId, {
      status: 'mediation',
      escalation_notes: reason.reason,
      escalated_at: new Date().toISOString(),
      escalated_by: userId,
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: dispute.payment_id,
      milestone_id: milestone.id,
      dispute_id: disputeId,
      event_type: 'dispute_escalated',
      event_description: `Dispute manually escalated to mediation: ${reason.reason}`,
      triggered_by: userId,
      triggered_by_role: project.client_id === userId ? 'client' : 'seller',
    });

    this.logger.log(`✅ Dispute ${disputeId} escalated to mediation by user ${userId}`);

    return {
      success: true,
      message: 'Dispute escalated to mediation',
      dispute_id: disputeId,
    };
  }

  /**
   * Withdraw a dispute (only during negotiation phase)
   */
  async withdrawDispute(disputeId: string, userId: string, reason: { reason: string }) {
    const dispute = await this.getDisputeById(disputeId);

    // Only allow withdrawal during negotiation
    if (dispute.status !== 'negotiation') {
      throw new BadRequestException('Dispute can only be withdrawn during negotiation phase');
    }

    // Verify user is the one who opened the dispute
    if (dispute.opened_by !== userId) {
      throw new BadRequestException('Only the party who opened the dispute can withdraw it');
    }

    // Update dispute status
    await this.db.update('payment_disputes', disputeId, {
      status: 'withdrawn',
      resolution: 'withdrawn',
      resolution_notes: reason.reason,
      resolved_at: new Date().toISOString(),
    });

    // Get payment and milestone info for timeline
    const payment = await this.db.findOne('payments', { id: dispute.payment_id });
    const milestone = await this.db.findOne('project_milestones', { id: payment.milestone_id });
    const project = await this.db.findOne('projects', { id: milestone.project_id });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: dispute.payment_id,
      milestone_id: milestone.id,
      dispute_id: disputeId,
      event_type: 'dispute_withdrawn',
      event_description: `Dispute withdrawn: ${reason.reason}`,
      triggered_by: userId,
      triggered_by_role: project.client_id === userId ? 'client' : 'seller',
    });

    this.logger.log(`✅ Dispute ${disputeId} withdrawn by user ${userId}`);

    return {
      success: true,
      message: 'Dispute withdrawn successfully',
      dispute_id: disputeId,
    };
  }
}
