import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Stripe from 'stripe';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/dto';
import { TeamAtOnceGateway } from '../../websocket/teamatonce.gateway';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Escrow Service
 *
 * Implements Stripe manual capture flow for milestone-based escrow payments.
 * Based on ESCROW_PAYMENT_SYSTEM_DESIGN.md Phase 3.
 *
 * Key Features:
 * - Authorize payments without immediate capture (hold funds in escrow)
 * - 14-day auto-approval timeline after deliverable submission
 * - Manual approval/rejection by client
 * - Change request handling with timeline extension
 * - Automated payment release and refund processing
 * - Complete audit trail with timeline events
 *
 * Stripe Manual Capture Flow:
 * 1. Client funds milestone → PaymentIntent with capture_method: 'manual'
 * 2. Card is authorized but not charged (funds held up to 90 days)
 * 3. Developer submits deliverables → 14-day review period starts
 * 4. Client approves OR auto-approve after 14 days → Capture payment
 * 5. Client requests changes → Extend timeline, continue holding
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private stripe: any;

  // Configurable constants from environment variables
  private readonly PLATFORM_FEE_PERCENT: number;
  private readonly AUTO_APPROVE_DAYS: number;
  private readonly CHANGE_REQUEST_EXTENSION_DAYS: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => TeamAtOnceGateway))
    private readonly teamAtOnceGateway: TeamAtOnceGateway,
    private readonly stripeConnect: StripeConnectService,
  ) {
    // Load configuration from environment variables
    this.PLATFORM_FEE_PERCENT = this.config.get<number>('PLATFORM_FEE_PERCENT', 0);
    this.AUTO_APPROVE_DAYS = this.config.get<number>('AUTO_APPROVE_DAYS', 14);
    this.CHANGE_REQUEST_EXTENSION_DAYS = this.config.get<number>('CHANGE_REQUEST_EXTENSION_DAYS', 7);

    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-09-30.clover' as any,
      typescript: true,
    });

    this.logger.log('✅ Escrow Service initialized with Stripe manual capture');
  }

  // ============================================
  // CORE ESCROW FLOW METHODS
  // ============================================

  /**
   * Step 1: Client funds milestone in escrow
   *
   * Creates a Stripe PaymentIntent with manual capture:
   * - Card is authorized but NOT charged yet
   * - Funds held in escrow for up to 90 days
   * - Platform fee (10%) set as application_fee_amount
   * - Transfer destination set to developer's Connect account
   *
   * @param milestoneId - ID of the milestone being funded
   * @param projectId - ID of the project
   * @param clientId - ID of the client (user ID)
   * @param amount - Amount in USD (e.g., 1000 for $1000)
   * @param paymentMethodId - Stripe payment method ID from client
   * @returns Payment record with escrow_status: 'authorized'
   */
  async fundMilestoneEscrow(
    milestoneId: string,
    projectId: string,
    clientId: string,
    amount: number,
    paymentMethodId: string,
  ) {
    this.logger.log(`Funding milestone ${milestoneId} in escrow: $${amount}`);

    // Verify milestone exists
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    if (milestone.project_id !== projectId) {
      throw new BadRequestException('Milestone does not belong to this project');
    }

    // Get project to find developer
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get seller from assigned_company_id
    let sellerId: string | null = null;

    if (project.assigned_company_id) {
      // Find the owner or first active member of the assigned seller company
      const sellerCompanyMembers = await this.db.findMany('company_team_members', {
        company_id: project.assigned_company_id,
        status: 'active',
      });

      // Prefer the owner, otherwise take the first active member
      const owner = sellerCompanyMembers.find((m: any) => m.role === 'owner');
      sellerId = owner?.user_id || sellerCompanyMembers[0]?.user_id;
    }

    // Fallback: Check project_members table for sellers
    if (!sellerId) {
      const sellerMember = await this.db.findOne('project_members', {
        project_id: projectId,
        member_type: 'seller',
        is_active: true,
      });
      sellerId = sellerMember?.user_id;
    }

    // Fallback to old fields for backward compatibility
    if (!sellerId) {
      sellerId = project.team_lead_id || project.assigned_team?.[0]?.user_id;
    }

    if (!sellerId) {
      throw new BadRequestException('Project must have an assigned seller');
    }

    // Check if payment already exists for this milestone
    const existingPayment = await this.db.findOne('payments', {
      milestone_id: milestoneId,
    });

    if (existingPayment) {
      if (existingPayment.escrow_status === 'authorized' || existingPayment.escrow_status === 'held') {
        throw new BadRequestException('Milestone already funded in escrow');
      }
    }

    // Get developer's Stripe Connect account
    const sellerStripeAccount = await this.stripeConnect.getDeveloperConnectAccount(sellerId);

    // Verify seller has a connected account that can receive payments
    if (!sellerStripeAccount) {
      throw new BadRequestException(
        'Developer must set up their Stripe Connect account before receiving payments. ' +
        'Please ask them to complete the payment setup in their account settings.'
      );
    }

    // Verify the account can receive payments
    const verification = await this.stripeConnect.verifyAccountCanReceivePayments(sellerId);
    if (!verification.canReceivePayments) {
      const reasons = verification.blockingReasons.join(', ');
      throw new BadRequestException(
        `Developer's Stripe account is not ready to receive payments: ${reasons}. ` +
        'They need to complete their account onboarding first.'
      );
    }

    // First, retrieve the payment method to see which customer it belongs to
    let clientStripeCustomer: string;
    try {
      const paymentMethodDetails = await this.stripe.paymentMethods.retrieve(paymentMethodId);

      if (paymentMethodDetails.customer) {
        // Payment method is already attached to a customer, use that customer
        clientStripeCustomer = paymentMethodDetails.customer as string;
        this.logger.log(`Using customer from payment method: ${clientStripeCustomer}`);
      } else {
        // Payment method is not attached, get/create customer and attach it
        clientStripeCustomer = await this.getOrCreateStripeCustomer(clientId);
        this.logger.log(`Payment method not attached to customer, attaching to: ${clientStripeCustomer}`);
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: clientStripeCustomer,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to retrieve payment method: ${error.message}`);
      throw new BadRequestException('Invalid payment method');
    }

    // Calculate platform fee and net amount
    const platformFee = this.calculatePlatformFee(amount);
    const sellerAmount = amount - platformFee;

    this.logger.log(`Platform fee: $${platformFee}, Seller amount: $${sellerAmount}`);

    // Create Payment Intent with MANUAL capture (escrow mode)
    let paymentIntent: any;
    try {
      paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        customer: clientStripeCustomer,
        payment_method: paymentMethodId,
        capture_method: 'manual', // KEY: Don't capture yet - hold in escrow!
        confirm: true, // Immediately confirm to authorize the card
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // Disable redirect-based payment methods
        },
        // Platform fee (10%) goes to the platform, rest to seller
        application_fee_amount: Math.round(platformFee * 100),
        // Transfer funds to seller's Stripe Connect account on capture
        transfer_data: {
          destination: sellerStripeAccount,
        },
        metadata: {
          project_id: projectId,
          milestone_id: milestoneId,
          client_id: clientId,
          seller_id: sellerId,
          platform_fee: platformFee.toString(),
          developer_amount: sellerAmount.toString(),
          escrow: 'true',
          flow: 'manual_capture_escrow',
        },
        description: `Escrow for milestone: ${milestone.name}`,
      });

      this.logger.log(`PaymentIntent created: ${paymentIntent.id}, status: ${paymentIntent.status}`);
    } catch (error) {
      this.logger.error(`Failed to create PaymentIntent: ${error.message}`, error.stack);
      throw new BadRequestException(`Payment authorization failed: ${error.message}`);
    }

    // Verify payment intent is in correct state
    if (paymentIntent.status !== 'requires_capture') {
      this.logger.warn(`PaymentIntent status is ${paymentIntent.status}, expected 'requires_capture'`);
      // Some payment methods may have different states, log but continue
    }

    // Create payment record with escrow status
    const payment = await this.db.insert('payments', {
      project_id: projectId,
      milestone_id: milestoneId,
      client_id: clientId,
      payment_type: 'milestone_escrow',
      amount: amount,
      currency: 'USD',
      status: 'pending', // Overall payment status
      escrow_status: 'authorized', // ⭐ Escrow-specific status
      payment_method: 'stripe_card',
      stripe_payment_intent_id: paymentIntent.id,
      platform_fee: platformFee,
      net_amount: sellerAmount,
      description: `Escrow payment for milestone: ${milestone.name}`,
      metadata: JSON.stringify({
        seller_id: sellerId,
        developer_stripe_account: sellerStripeAccount,
        developer_id: sellerId,
        payment_intent_status: paymentIntent.status,
        payment_method_id: paymentMethodId,
        authorized_at: new Date().toISOString(),
      }),
    });

    this.logger.log(`Payment record created: ${payment.id}`);

    // Create timeline event for audit trail
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: milestoneId,
      event_type: 'escrow_funded',
      event_description: `Client funded milestone in escrow: $${amount} (Developer will receive $${sellerAmount} after 10% platform fee)`,
      triggered_by: clientId,
      triggered_by_role: 'client',
      event_data: {
        amount,
        platform_fee: platformFee,
        developer_amount: sellerAmount,
        payment_intent_id: paymentIntent.id,
        payment_intent_status: paymentIntent.status,
      },
    });

    // Update milestone status to in_progress (developer can now start work)
    await this.db.update('project_milestones', milestoneId, {
      payment_status: 'escrowed',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });

    this.logger.log(`Milestone ${milestoneId} status updated to in_progress`);

    // Emit WebSocket event for real-time UI updates
    this.emitPaymentEvent(projectId, 'payment-funded', {
      payment: this.parseJson(payment),
      milestone: this.parseJson(milestone),
      milestoneId,
      amount,
      escrowStatus: 'authorized',
    }, clientId);

    // Send notification to developer that milestone is funded
    try {
      await this.notificationsService.sendNotification({
        user_id: sellerId,
        type: NotificationType.FINANCE,
        title: 'Milestone Funded - Ready to Start',
        message: `Client has funded milestone "${milestone.name}" with $${amount}. You can now start working on this milestone.`,
        priority: NotificationPriority.HIGH,
        action_url: `/project/${projectId}/milestone-approval`,
        data: { projectId, milestoneId, milestoneName: milestone.name, amount, paymentId: payment.id },
        send_push: true,
      });
    } catch (error) {
      this.logger.error(`Failed to send milestone funded notification: ${error.message}`);
    }

    return {
      success: true,
      payment: this.parseJson(payment),
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
      message: `Milestone funded in escrow. $${amount} authorized. Developer can now begin work.`,
    };
  }

  /**
   * Step 2: Developer submits deliverables for review
   *
   * Creates a deliverable record and starts the 14-day auto-approval timer.
   * Client now has 14 days to review and either:
   * - Approve (release payment immediately)
   * - Request changes (extend timeline)
   * - Do nothing (auto-approve after 14 days)
   *
   * @param milestoneId - ID of the milestone
   * @param sellerId - ID of the developer submitting
   * @param files - Array of file URLs from storage
   * @param description - Description of the deliverables
   * @param deliverableType - Type: 'code', 'design', 'documentation', etc.
   * @returns Deliverable record with auto_approve_at date
   */
  async submitDeliverablesInternal(
    milestoneId: string,
    sellerId: string,
    files: string[],
    description: string,
    deliverableType: string = 'code',
  ) {
    this.logger.log(`Developer ${sellerId} submitting deliverables for milestone ${milestoneId}`);

    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    // Get payment and verify it's in escrow
    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    if (!payment) {
      throw new BadRequestException('Milestone must be funded in escrow first');
    }

    if (payment.escrow_status !== 'authorized') {
      throw new BadRequestException(
        `Cannot submit deliverables. Payment escrow status is '${payment.escrow_status}', expected 'authorized'`,
      );
    }

    // Check if deliverable already exists
    const existingDeliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: milestoneId,
    });

    if (existingDeliverable && existingDeliverable.review_status === 'pending') {
      throw new BadRequestException('Deliverables already submitted and pending review');
    }

    // Calculate auto-approve date (14 days from now)
    const autoApproveDate = new Date();
    autoApproveDate.setDate(autoApproveDate.getDate() + this.AUTO_APPROVE_DAYS);

    this.logger.log(`Auto-approve date set to: ${autoApproveDate.toISOString()}`);

    // Create deliverable record
    const deliverable = await this.db.insert('milestone_deliverables', {
      milestone_id: milestoneId,
      project_id: milestone.project_id,
      submitted_by: sellerId,
      submitted_at: new Date().toISOString(),
      deliverable_files: JSON.stringify(files),
      deliverable_description: description,
      deliverable_type: deliverableType,
      review_status: 'pending',
      auto_approve_at: autoApproveDate.toISOString(),
      auto_approved: false,
    });

    this.logger.log(`Deliverable record created: ${deliverable.id}`);

    // Update payment escrow status to 'held' (now in review period)
    await this.db.update('payments', payment.id, {
      escrow_status: 'held',
      escrow_hold_until: autoApproveDate.toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update milestone status to 'review'
    await this.db.update('project_milestones', milestoneId, {
      status: 'review',
      completed_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: milestoneId,
      event_type: 'deliverable_submitted',
      event_description: `Seller submitted deliverables for review. Auto-approval scheduled for ${autoApproveDate.toLocaleDateString()}`,
      triggered_by: sellerId,
      triggered_by_role: 'seller',
      event_data: {
        files_count: files.length,
        deliverable_type: deliverableType,
        auto_approve_date: autoApproveDate.toISOString(),
        review_period_days: this.AUTO_APPROVE_DAYS,
      },
    });

    // TODO: Schedule auto-approval job
    // This will be handled by a cron job that checks for deliverables
    // past their auto_approve_at date
    // await this.scheduleAutoApproval(payment.id, milestoneId, autoApproveDate);

    // Emit WebSocket event for real-time UI updates
    this.emitPaymentEvent(milestone.project_id, 'deliverable-submitted', {
      payment: this.parseJson(payment),
      deliverable: this.parseJson(deliverable),
      milestone: this.parseJson(milestone),
      milestoneId,
      autoApproveDate: autoApproveDate.toISOString(),
      escrowStatus: 'held',
    }, sellerId);

    // Notify client to review deliverables
    try {
      await this.notificationsService.sendNotification({
        user_id: payment.client_id,
        type: NotificationType.FINANCE,
        title: 'Deliverables Ready for Review',
        message: `Developer has submitted deliverables for milestone "${milestone.name}". Please review within ${this.AUTO_APPROVE_DAYS} days. Auto-approval on ${autoApproveDate.toLocaleDateString()}.`,
        priority: NotificationPriority.HIGH,
        action_url: `/project/${milestone.project_id}/milestone-approval`,
        data: {
          projectId: milestone.project_id,
          milestoneId,
          milestoneName: milestone.name,
          autoApproveDate: autoApproveDate.toISOString(),
          reviewPeriodDays: this.AUTO_APPROVE_DAYS,
        },
        send_push: true,
        send_email: true,
      });
    } catch (error) {
      this.logger.error(`Failed to send deliverable review notification: ${error.message}`);
    }

    this.logger.log(`Deliverables submitted successfully. Auto-approve in ${this.AUTO_APPROVE_DAYS} days`);

    return {
      success: true,
      deliverable: this.parseJson(deliverable),
      autoApproveDate,
      reviewPeriodDays: this.AUTO_APPROVE_DAYS,
      message: `Deliverables submitted. Client has ${this.AUTO_APPROVE_DAYS} days to review. Auto-approval on ${autoApproveDate.toLocaleDateString()}`,
    };
  }

  /**
   * Step 3: Client approves milestone OR system auto-approves after 14 days
   *
   * Captures the PaymentIntent (actually charges the card) and transfers
   * funds to developer's Connect account. This is irreversible.
   *
   * @param milestoneId - ID of the milestone
   * @param clientId - ID of the client (or null for auto-approve)
   * @param isAutoApproved - Whether this is an automatic approval
   * @param reviewNotes - Optional review notes from client
   * @returns Updated payment record with escrow_status: 'released'
   */
  async approveMilestoneAndRelease(
    milestoneId: string,
    clientId: string | null,
    isAutoApproved: boolean = false,
    reviewNotes?: string,
  ) {
    this.logger.log(
      `${isAutoApproved ? 'Auto-approving' : 'Approving'} milestone ${milestoneId}`,
    );

    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    // Allow release when payment is 'held' (deliverables submitted) OR 'authorized' (early release)
    if (payment.escrow_status !== 'held' && payment.escrow_status !== 'authorized') {
      throw new BadRequestException(
        `Cannot approve milestone. Payment escrow status is '${payment.escrow_status}', expected 'held' or 'authorized'`,
      );
    }

    const isEarlyRelease = payment.escrow_status === 'authorized';

    // Get deliverable to update (may not exist for early release)
    const deliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: milestoneId,
    });

    // Only require deliverable if not early release
    if (!deliverable && !isEarlyRelease) {
      throw new NotFoundException('Deliverable not found');
    }

    // Update deliverable status to approved (if exists)
    if (deliverable) {
      await this.db.update('milestone_deliverables', deliverable.id, {
        review_status: 'approved',
        reviewed_by: isAutoApproved ? 'system' : clientId,
        reviewed_at: new Date().toISOString(),
        review_notes: isAutoApproved ? 'Auto-approved after 14-day review period' : (isEarlyRelease ? 'Early release by client' : reviewNotes),
        auto_approved: isAutoApproved,
        updated_at: new Date().toISOString(),
      });

      this.logger.log(`Deliverable ${deliverable.id} marked as approved`);
    } else {
      this.logger.log(`Early release for milestone ${milestoneId} - no deliverable to update`);
    }

    // ⭐ CAPTURE THE PAYMENT - Actually charge the card!
    let paymentIntent: any;
    try {
      paymentIntent = await this.stripe.paymentIntents.capture(
        payment.stripe_payment_intent_id,
      );

      this.logger.log(
        `PaymentIntent ${paymentIntent.id} captured successfully. Status: ${paymentIntent.status}`,
      );
    } catch (error) {
      this.logger.error(`Failed to capture PaymentIntent: ${error.message}`, error.stack);
      throw new BadRequestException(`Payment capture failed: ${error.message}`);
    }

    // Money is now captured and will be automatically transferred to developer's
    // Connect account (because we set transfer_data.destination when creating)

    // Update payment record
    await this.db.update('payments', payment.id, {
      status: 'completed',
      escrow_status: 'released',
      escrow_released_at: new Date().toISOString(),
      transaction_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: JSON.stringify({
        ...this.safeJsonParse(payment.metadata),
        released_at: new Date().toISOString(),
        capture_id: paymentIntent.id,
        is_auto_approved: isAutoApproved,
        is_early_release: isEarlyRelease,
      }),
    });

    // Update milestone
    await this.db.update('project_milestones', milestoneId, {
      status: 'approved',
      approved_by: isAutoApproved ? 'system' : clientId,
      approved_at: new Date().toISOString(),
      approval_notes: isAutoApproved ? 'Auto-approved after review period' : (isEarlyRelease ? 'Early release by client' : reviewNotes),
      payment_status: 'paid',
      payment_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: milestoneId,
      event_type: isAutoApproved ? 'auto_approved' : 'client_approved',
      event_description: isAutoApproved
        ? `Milestone auto-approved after ${this.AUTO_APPROVE_DAYS}-day review period - payment of $${payment.net_amount} released to developer`
        : `Client approved deliverables - payment of $${payment.net_amount} released to developer`,
      triggered_by: isAutoApproved ? 'system' : clientId,
      triggered_by_role: isAutoApproved ? 'system' : 'client',
      event_data: {
        amount_released: payment.net_amount,
        capture_id: paymentIntent.id,
        payment_intent_status: paymentIntent.status,
        is_auto_approved: isAutoApproved,
        review_notes: reviewNotes || null,
      },
    });

    this.logger.log(
      `Payment of $${payment.net_amount} released to developer successfully`,
    );

    // Get milestone info for notification
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    const project = await this.db.findOne('projects', { id: payment.project_id });

    // Emit WebSocket event for real-time UI updates
    this.emitPaymentEvent(payment.project_id, 'payment-released', {
      payment: this.parseJson(payment),
      milestone: this.parseJson(milestone),
      milestoneId,
      amount: payment.net_amount,
      escrowStatus: 'released',
      isAutoApproved,
    }, clientId);

    // Notify developer that payment has been released
    try {
      const metadata = this.safeJsonParse(payment.metadata) || {};
      const sellerId = metadata.developer_id;

      if (sellerId) {
        await this.notificationsService.sendNotification({
          user_id: sellerId,
          type: NotificationType.FINANCE,
          title: isAutoApproved ? 'Payment Auto-Released!' : 'Payment Released!',
          message: `${isAutoApproved ? 'Auto-approved: ' : ''}$${payment.net_amount} has been released for milestone "${milestone?.name || 'Unknown'}" in project "${project?.name || 'Unknown'}".`,
          priority: NotificationPriority.HIGH,
          action_url: `/project/${payment.project_id}/contract-payment`,
          data: {
            projectId: payment.project_id,
            milestoneId,
            amount: payment.net_amount,
            isAutoApproved,
          },
          send_push: true,
          send_email: true,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send payment released notification: ${error.message}`);
    }

    return {
      success: true,
      payment: this.parseJson(payment),
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
      message: `Payment of $${payment.net_amount} released to developer`,
    };
  }

  /**
   * Step 3 Alternative: Client requests changes (not a dispute)
   *
   * Keeps payment in escrow but extends the review timeline.
   * Developer can resubmit or update deliverables.
   *
   * @param milestoneId - ID of the milestone
   * @param clientId - ID of the client requesting changes
   * @param changeNotes - Description of requested changes
   * @param extendDays - Number of days to extend (default: 7)
   * @returns Updated deliverable with new deadline
   */
  async requestChangesInternal(
    milestoneId: string,
    clientId: string,
    changeNotes: string,
    extendDays: number = this.CHANGE_REQUEST_EXTENSION_DAYS,
  ) {
    this.logger.log(`Client ${clientId} requesting changes for milestone ${milestoneId}`);

    const deliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: milestoneId,
    });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.escrow_status !== 'held') {
      throw new BadRequestException('Payment must be in held status to request changes');
    }

    // Update deliverable to changes_requested status
    await this.db.update('milestone_deliverables', deliverable.id, {
      review_status: 'changes_requested',
      reviewed_by: clientId,
      reviewed_at: new Date().toISOString(),
      review_notes: changeNotes,
      updated_at: new Date().toISOString(),
    });

    // Extend auto-approve date by specified days
    const currentAutoApprove = new Date(deliverable.auto_approve_at);
    const newAutoApproveDate = new Date(currentAutoApprove);
    newAutoApproveDate.setDate(currentAutoApprove.getDate() + extendDays);

    this.logger.log(
      `Extending auto-approve from ${currentAutoApprove.toISOString()} to ${newAutoApproveDate.toISOString()}`,
    );

    await this.db.update('milestone_deliverables', deliverable.id, {
      auto_approve_at: newAutoApproveDate.toISOString(),
    });

    // Update payment hold_until date
    await this.db.update('payments', payment.id, {
      escrow_hold_until: newAutoApproveDate.toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update milestone back to in_progress
    await this.db.update('project_milestones', milestoneId, {
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });

    // Create timeline event
    await this.createTimelineEvent({
      payment_id: payment.id,
      milestone_id: milestoneId,
      event_type: 'changes_requested',
      event_description: `Client requested changes - deadline extended by ${extendDays} days to ${newAutoApproveDate.toLocaleDateString()}`,
      triggered_by: clientId,
      triggered_by_role: 'client',
      event_data: {
        change_notes: changeNotes,
        original_deadline: currentAutoApprove.toISOString(),
        new_deadline: newAutoApproveDate.toISOString(),
        extended_days: extendDays,
      },
    });

    this.logger.log(`Changes requested. New deadline: ${newAutoApproveDate.toISOString()}`);

    // Get milestone for WebSocket event
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });

    // Emit WebSocket event for real-time UI updates
    this.emitPaymentEvent(payment.project_id, 'changes-requested', {
      payment: this.parseJson(payment),
      deliverable: this.parseJson(deliverable),
      milestone: this.parseJson(milestone),
      milestoneId,
      changeNotes,
      newDeadline: newAutoApproveDate.toISOString(),
      extendedDays: extendDays,
      escrowStatus: 'held',
    }, clientId);

    // Notify developer about changes requested
    try {
      const project = await this.db.findOne('projects', { id: payment.project_id });

      await this.notificationsService.sendNotification({
        user_id: deliverable.submitted_by,
        type: NotificationType.REMINDER,
        title: 'Changes Requested on Deliverable',
        message: `Client has requested changes on milestone "${milestone?.name || 'Unknown'}": ${changeNotes.substring(0, 150)}${changeNotes.length > 150 ? '...' : ''}`,
        priority: NotificationPriority.HIGH,
        action_url: `/project/${payment.project_id}/milestone-approval`,
        data: {
          projectId: payment.project_id,
          milestoneId,
          changeNotes,
          newDeadline: newAutoApproveDate.toISOString(),
          extendedDays: extendDays,
        },
        send_push: true,
      });
    } catch (error) {
      this.logger.error(`Failed to send changes requested notification: ${error.message}`);
    }

    return {
      success: true,
      deliverable: this.parseJson(deliverable),
      newDeadline: newAutoApproveDate,
      extendedDays: extendDays,
      message: `Changes requested. Developer has been notified. New deadline: ${newAutoApproveDate.toLocaleDateString()}`,
    };
  }

  // ============================================
  // WEBSOCKET HELPER METHODS
  // ============================================

  /**
   * Emit payment event via WebSocket for real-time updates
   */
  private emitPaymentEvent(
    projectId: string,
    eventType: 'payment-funded' | 'payment-released' | 'payment-updated' | 'deliverable-submitted' | 'changes-requested' | 'payment-refunded',
    data: any,
    userId?: string,
  ) {
    try {
      this.teamAtOnceGateway.sendToProject(projectId, eventType, {
        ...data,
        userId,
        timestamp: new Date().toISOString(),
      });
      this.logger.debug(`Emitted ${eventType} event for project ${projectId}`);
    } catch (error) {
      this.logger.error(`Failed to emit ${eventType} event: ${error.message}`);
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get or create Stripe customer for client
   *
   * @param clientId - user ID
   * @returns Stripe customer ID
   */
  private async getOrCreateStripeCustomer(clientId: string): Promise<string> {
    // Check if user already has a Stripe customer ID stored
    // Use getUserById from database service which queries auth.users
    const user = await this.db.getUserById(clientId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cast to any to access user_metadata which exists at runtime but not in type definition
    const userAny = user as any;

    // First, check if user already has a Stripe customer ID in metadata
    const existingCustomerIdInMetadata = user.metadata?.stripe_customer_id || userAny.user_metadata?.stripe_customer_id;
    if (existingCustomerIdInMetadata) {
      this.logger.log(`Found existing Stripe customer in metadata: ${existingCustomerIdInMetadata}`);
      return existingCustomerIdInMetadata;
    }

    // Second, search Stripe by email (this is how payment service finds customers)
    // This ensures consistency with payment methods attached via the payment service
    this.logger.log(`Searching Stripe for customer by email: ${user.email}`);
    const existingCustomers = await this.stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const existingCustomer = existingCustomers.data[0];
      this.logger.log(`Found existing Stripe customer by email: ${existingCustomer.id}`);

      // Store the customer ID in user metadata for future lookups
      const updatedMetadata = {
        ...(userAny.user_metadata || {}),
        stripe_customer_id: existingCustomer.id,
      };

      await this.db.updateUser(clientId, {
        user_metadata: updatedMetadata,
      });

      return existingCustomer.id;
    }

    // Create new Stripe customer if none exists
    this.logger.log(`Creating new Stripe customer for user: ${clientId}`);
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name || userAny.user_metadata?.name || user.email,
      metadata: {
        user_id: clientId,
        platform: 'teamatonce',
      },
    });

    // Store the Stripe customer ID in user metadata
    // Use updateUser to update auth.users metadata
    const updatedMetadata = {
      ...(userAny.user_metadata || {}),
      stripe_customer_id: customer.id,
    };

    await this.db.updateUser(clientId, {
      user_metadata: updatedMetadata,
    });

    this.logger.log(`Created Stripe customer: ${customer.id}`);
    return customer.id;
  }

  /**
   * Calculate platform fee (10% of amount)
   *
   * @param amount - Payment amount
   * @returns Platform fee amount
   */
  private calculatePlatformFee(amount: number): number {
    return Math.round((amount * this.PLATFORM_FEE_PERCENT) / 100);
  }

  /**
   * Create timeline event for audit trail
   *
   * @param eventData - Event data
   */
  private async createTimelineEvent(eventData: {
    payment_id: string;
    milestone_id: string;
    dispute_id?: string;
    event_type: string;
    event_description: string;
    triggered_by: string;
    triggered_by_role: 'client' | 'seller' | 'system' | 'admin';
    event_data: any;
  }): Promise<void> {
    try {
      await this.db.insert('escrow_timeline_events', {
        payment_id: eventData.payment_id,
        milestone_id: eventData.milestone_id,
        dispute_id: eventData.dispute_id || null,
        event_type: eventData.event_type,
        event_description: eventData.event_description,
        triggered_by: eventData.triggered_by,
        triggered_by_role: eventData.triggered_by_role,
        event_data: JSON.stringify(eventData.event_data),
        created_at: new Date().toISOString(),
      });

      this.logger.debug(`Timeline event created: ${eventData.event_type}`);
    } catch (error) {
      this.logger.error(`Failed to create timeline event: ${error.message}`, error.stack);
      // Don't throw - timeline events are for audit only
    }
  }

  /**
   * Parse JSON fields in database records
   */
  private parseJson(record: any): any {
    if (!record) return null;

    const parsed = { ...record };

    // Parse common JSON fields
    const jsonFields = [
      'metadata',
      'deliverable_files',
      'evidence_files',
      'response_files',
      'event_data',
    ];

    for (const field of jsonFields) {
      if (parsed[field]) {
        parsed[field] = this.safeJsonParse(parsed[field]);
      }
    }

    return parsed;
  }

  /**
   * Safely parse JSON with fallback
   */
  private safeJsonParse(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get payment with escrow status by milestone ID
   */
  async getPaymentByMilestone(milestoneId: string) {
    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });

    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    return this.parseJson(payment);
  }

  /**
   * Get deliverable by milestone ID
   */
  async getDeliverableByMilestone(milestoneId: string) {
    const deliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: milestoneId,
    });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found for this milestone');
    }

    return this.parseJson(deliverable);
  }

  /**
   * Get timeline events for a payment
   */
  async getPaymentTimeline(paymentId: string, userId?: string) {
    // If userId provided, verify access
    if (userId) {
      const payment = await this.db.findOne('payments', { id: paymentId });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const project = await this.db.findOne('projects', { id: payment.project_id });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Verify user is either client or developer on the project
      const hasAccess = project.client_id === userId || project.developer_id === userId;
      if (!hasAccess) {
        throw new BadRequestException('Access denied to payment timeline');
      }
    }

    const events = await this.db.findMany(
      'escrow_timeline_events',
      { payment_id: paymentId },
      { orderBy: 'created_at', order: 'asc' },
    );

    return events.map((e) => this.parseJson(e));
  }

  /**
   * Get timeline events for a milestone
   */
  async getMilestoneTimeline(milestoneId: string) {
    const events = await this.db.findMany(
      'escrow_timeline_events',
      { milestone_id: milestoneId },
      { orderBy: 'created_at', order: 'asc' },
    );

    return events.map((e) => this.parseJson(e));
  }

  /**
   * Get all deliverables ready for auto-approval
   * Used by cron job to process automatic approvals
   */
  async getDeliverablesForAutoApproval() {
    const now = new Date();

    // Find deliverables that:
    // 1. Are pending review
    // 2. Haven't been auto-approved yet
    // 3. Are past their auto_approve_at deadline
    const deliverables = await this.db.findMany('milestone_deliverables', {
      review_status: 'pending',
      auto_approved: false,
    });

    // Filter by date (database may not support $lte in findMany)
    const ready = deliverables.filter((d) => {
      const autoApproveDate = new Date(d.auto_approve_at);
      return autoApproveDate <= now;
    });

    return ready.map((d) => this.parseJson(d));
  }

  // ============================================
  // WRAPPER METHODS FOR CONTROLLER
  // ============================================

  /**
   * Wrapper for fundMilestoneEscrow that accepts a DTO
   */
  async fundMilestone(userId: string, dto: any) {
    const milestone = await this.db.findOne('project_milestones', { id: dto.milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    // Get project to verify user is the client
    const project = await this.db.findOne('projects', { id: milestone.project_id });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Only the project client can deposit funds to escrow
    if (project.client_id !== userId) {
      throw new ForbiddenException('Only the project client can deposit funds to escrow');
    }

    return this.fundMilestoneEscrow(
      dto.milestoneId,
      milestone.project_id,
      userId,
      dto.amount,
      dto.paymentMethodId,
    );
  }

  /**
   * Wrapper for submitDeliverables that accepts a DTO
   */
  async submitDeliverables(userId: string, dto: any) {
    return this.submitDeliverablesInternal(
      dto.milestoneId,
      userId,
      dto.files,
      dto.description,
      dto.deliverableType || 'code',
    );
  }

  /**
   * Approve deliverable and release payment - wrapper for controller
   */
  async approveDeliverable(userId: string, dto: any) {
    return this.approveMilestoneAndRelease(
      dto.milestoneId,
      userId,
      false,
      dto.reviewNotes,
    );
  }

  /**
   * Request changes wrapper that accepts DTO
   */
  async requestChanges(userId: string, dto: any) {
    return this.requestChangesInternal(
      dto.milestoneId,
      userId,
      dto.changeNotes,
      dto.extendDays,
    );
  }

  /**
   * Process refund from escrow
   */
  async refundEscrow(userId: string, dto: any) {
    this.logger.log(`Processing refund for milestone ${dto.milestoneId}`);

    const payment = await this.db.findOne('payments', { milestone_id: dto.milestoneId });
    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    if (payment.escrow_status !== 'authorized' && payment.escrow_status !== 'held') {
      throw new BadRequestException(
        `Cannot refund payment with escrow status: ${payment.escrow_status}`,
      );
    }

    try {
      // Cancel the PaymentIntent to release the authorization
      const paymentIntent = await this.stripe.paymentIntents.cancel(
        payment.stripe_payment_intent_id,
      );

      this.logger.log(`PaymentIntent ${paymentIntent.id} canceled for refund`);

      // Update payment record
      await this.db.update('payments', payment.id, {
        status: 'refunded',
        escrow_status: 'refunded',
        escrow_refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update milestone
      await this.db.update('project_milestones', dto.milestoneId, {
        payment_status: 'refunded',
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });

      // Create timeline event
      await this.createTimelineEvent({
        payment_id: payment.id,
        milestone_id: dto.milestoneId,
        event_type: 'payment_refunded',
        event_description: `Payment refunded: ${dto.reason}`,
        triggered_by: userId,
        triggered_by_role: 'client',
        event_data: {
          reason: dto.reason,
          amount: payment.amount,
          refund_type: dto.fullRefund ? 'full' : 'partial',
        },
      });

      // Get milestone for WebSocket event
      const milestone = await this.db.findOne('project_milestones', { id: dto.milestoneId });

      // Emit WebSocket event for real-time UI updates
      this.emitPaymentEvent(payment.project_id, 'payment-refunded', {
        payment: this.parseJson(payment),
        milestone: this.parseJson(milestone),
        milestoneId: dto.milestoneId,
        amount: payment.amount,
        reason: dto.reason,
        escrowStatus: 'refunded',
      }, userId);

      return {
        success: true,
        payment: this.parseJson(payment),
        message: 'Refund processed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to process refund: ${error.message}`, error.stack);
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Get escrow status for a milestone
   */
  async getMilestoneEscrowStatus(milestoneId: string, userId: string) {
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const payment = await this.db.findOne('payments', { milestone_id: milestoneId });
    const deliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: milestoneId,
    });

    return {
      milestone: this.parseJson(milestone),
      payment: payment ? this.parseJson(payment) : null,
      deliverable: deliverable ? this.parseJson(deliverable) : null,
      escrowStatus: payment?.escrow_status || 'not_funded',
      paymentStatus: milestone.payment_status,
      milestoneStatus: milestone.status,
    };
  }

  /**
   * Get all escrow transactions for a project
   */
  async getProjectEscrows(projectId: string, userId: string) {
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const payments = await this.db.findMany('payments', { project_id: projectId });

    return payments.map((p) => this.parseJson(p));
  }

  /**
   * Configure auto-release settings for a milestone
   */
  async configureAutoRelease(userId: string, dto: any) {
    const deliverable = await this.db.findOne('milestone_deliverables', {
      milestone_id: dto.milestoneId,
    });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found for this milestone');
    }

    const payment = await this.db.findOne('payments', { milestone_id: dto.milestoneId });
    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    if (dto.enabled) {
      const daysAfterSubmission = dto.daysAfterSubmission || this.AUTO_APPROVE_DAYS;
      const submittedAt = new Date(deliverable.submitted_at);
      const newAutoApproveDate = new Date(submittedAt);
      newAutoApproveDate.setDate(submittedAt.getDate() + daysAfterSubmission);

      await this.db.update('milestone_deliverables', deliverable.id, {
        auto_approve_at: newAutoApproveDate.toISOString(),
        updated_at: new Date().toISOString(),
      });

      await this.db.update('payments', payment.id, {
        escrow_hold_until: newAutoApproveDate.toISOString(),
        updated_at: new Date().toISOString(),
      });

      await this.createTimelineEvent({
        payment_id: payment.id,
        milestone_id: dto.milestoneId,
        event_type: 'auto_release_configured',
        event_description: `Auto-release enabled: ${daysAfterSubmission} days after submission`,
        triggered_by: userId,
        triggered_by_role: 'client',
        event_data: {
          enabled: true,
          days_after_submission: daysAfterSubmission,
          auto_approve_date: newAutoApproveDate.toISOString(),
        },
      });

      return {
        success: true,
        autoApproveDate: newAutoApproveDate,
        daysAfterSubmission,
        message: `Auto-release configured for ${daysAfterSubmission} days after submission`,
      };
    } else {
      await this.createTimelineEvent({
        payment_id: payment.id,
        milestone_id: dto.milestoneId,
        event_type: 'auto_release_disabled',
        event_description: 'Auto-release disabled - manual approval required',
        triggered_by: userId,
        triggered_by_role: 'client',
        event_data: { enabled: false },
      });

      return {
        success: true,
        message: 'Auto-release disabled - manual approval required',
      };
    }
  }
}
