import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  ProcessPaymentDto,
  CreateMilestonePaymentDto,
  PaymentStatus,
} from './dto/payment.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../../notifications/dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================
  // PAYMENT MANAGEMENT
  // ============================================

  /**
   * Get all payments for a project
   */
  async getProjectPayments(projectId: string) {
    const payments = await this.db.findMany(
      'payments',
      { project_id: projectId },
      { orderBy: 'created_at', order: 'desc' }
    );

    return payments.map(p => this.parsePaymentJson(p));
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string) {
    const payment = await this.db.findOne('payments', { id: paymentId });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.parsePaymentJson(payment);
  }

  /**
   * Create a new payment
   */
  async createPayment(projectId: string, clientId: string, dto: CreatePaymentDto) {
    // Verify contract exists if provided
    if (dto.contractId) {
      const contract = await this.db.findOne('contracts', { id: dto.contractId });
      if (!contract) {
        throw new NotFoundException('Contract not found');
      }
    }

    // Verify milestone exists if provided
    if (dto.milestoneId) {
      const milestone = await this.db.findOne('project_milestones', { id: dto.milestoneId });
      if (!milestone) {
        throw new NotFoundException('Milestone not found');
      }
    }

    // Calculate net amount after platform fee
    const platformFee = dto.platformFee || 0;
    const netAmount = dto.amount - platformFee;

    const paymentData = {
      project_id: projectId,
      contract_id: dto.contractId || null,
      milestone_id: dto.milestoneId || null,
      client_id: clientId,
      payment_type: dto.paymentType,
      amount: dto.amount,
      currency: dto.currency || 'USD',
      status: PaymentStatus.PENDING,
      payment_method: dto.paymentMethod || null,
      description: dto.description || null,
      invoice_number: dto.invoiceNumber || null,
      platform_fee: platformFee,
      net_amount: netAmount,
      metadata: JSON.stringify({}),
      stripe_payment_intent_id: null,
      stripe_charge_id: null,
      transaction_id: null,
      transaction_date: null,
      invoice_url: null,
    };

    const payment = await this.db.insert('payments', paymentData);
    return this.parsePaymentJson(payment);
  }

  /**
   * Update payment details
   */
  async updatePayment(paymentId: string, dto: UpdatePaymentDto) {
    const payment = await this.db.findOne('payments', { id: paymentId });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const updateData: any = {};

    if (dto.status) updateData.status = dto.status;
    if (dto.amount !== undefined) {
      updateData.amount = dto.amount;
      // Recalculate net amount
      const platformFee = dto.platformFee !== undefined ? dto.platformFee : payment.platform_fee;
      updateData.net_amount = dto.amount - platformFee;
    }
    if (dto.paymentMethod) updateData.payment_method = dto.paymentMethod;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.transactionId) updateData.transaction_id = dto.transactionId;
    if (dto.invoiceNumber) updateData.invoice_number = dto.invoiceNumber;
    if (dto.invoiceUrl) updateData.invoice_url = dto.invoiceUrl;
    if (dto.platformFee !== undefined) {
      updateData.platform_fee = dto.platformFee;
      const amount = dto.amount !== undefined ? dto.amount : payment.amount;
      updateData.net_amount = amount - dto.platformFee;
    }

    updateData.updated_at = new Date().toISOString();

    await this.db.update('payments', paymentId, updateData);

    const updatedPayment = await this.db.findOne('payments', { id: paymentId });
    return this.parsePaymentJson(updatedPayment);
  }

  /**
   * Process a payment (mark as completed with transaction details)
   * TODO: Integrate with Stripe webhook for automatic processing
   */
  async processPayment(paymentId: string, processDto: ProcessPaymentDto) {
    const payment = await this.db.findOne('payments', { id: paymentId });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Payment has already been processed');
    }

    const updateData: any = {
      status: PaymentStatus.COMPLETED,
      payment_method: processDto.paymentMethod,
      transaction_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (processDto.stripePaymentIntentId) {
      updateData.stripe_payment_intent_id = processDto.stripePaymentIntentId;
    }
    if (processDto.stripeChargeId) {
      updateData.stripe_charge_id = processDto.stripeChargeId;
    }
    if (processDto.transactionId) {
      updateData.transaction_id = processDto.transactionId;
    }
    if (processDto.metadata) {
      updateData.metadata = JSON.stringify(processDto.metadata);
    }

    await this.db.update('payments', paymentId, updateData);

    // If payment is associated with a milestone, update milestone payment status
    if (payment.milestone_id) {
      await this.db.update('project_milestones', payment.milestone_id, {
        payment_status: 'paid',
        payment_date: new Date().toISOString(),
      });
    }

    // Send payment completion notification
    try {
      const project = await this.db.findOne('projects', { id: payment.project_id });

      // Notify client that payment was processed
      if (payment.client_id) {
        await this.notificationsService.sendNotification({
          user_id: payment.client_id,
          type: NotificationType.FINANCE,
          title: '💳 Payment Processed',
          message: `Your payment of $${payment.amount} for "${project?.name || 'project'}" has been successfully processed.`,
          priority: NotificationPriority.HIGH,
          action_url: `/projects/${payment.project_id}/payments`,
          data: { paymentId, projectId: payment.project_id, amount: payment.amount },
          send_push: true,
        });
      }

      // Notify developer about received payment
      if (project?.developer_id) {
        await this.notificationsService.sendNotification({
          user_id: project.developer_id,
          type: NotificationType.FINANCE,
          title: '💰 Payment Received',
          message: `Payment of $${payment.net_amount || payment.amount} has been received for "${project?.name || 'project'}".`,
          priority: NotificationPriority.HIGH,
          action_url: `/projects/${payment.project_id}/payments`,
          data: { paymentId, projectId: payment.project_id, amount: payment.net_amount || payment.amount },
          send_push: true,
        });
      }
    } catch (notifError) {
      console.error('[PaymentService] Error sending payment notification:', notifError);
    }

    const updatedPayment = await this.db.findOne('payments', { id: paymentId });
    return this.parsePaymentJson(updatedPayment);
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(paymentId: string, reason?: string) {
    const payment = await this.db.findOne('payments', { id: paymentId });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const metadata = this.safeJsonParse(payment.metadata) || {};
    if (reason) {
      metadata.failure_reason = reason;
      metadata.failed_at = new Date().toISOString();
    }

    await this.db.update('payments', paymentId, {
      status: PaymentStatus.FAILED,
      metadata: JSON.stringify(metadata),
      updated_at: new Date().toISOString(),
    });

    // Send payment failure notification
    try {
      const project = await this.db.findOne('projects', { id: payment.project_id });

      if (payment.client_id) {
        await this.notificationsService.sendNotification({
          user_id: payment.client_id,
          type: NotificationType.FINANCE,
          title: '❌ Payment Failed',
          message: `Your payment of $${payment.amount} for "${project?.name || 'project'}" has failed.${reason ? ` Reason: ${reason}` : ''}`,
          priority: NotificationPriority.URGENT,
          action_url: `/projects/${payment.project_id}/payments`,
          data: { paymentId, projectId: payment.project_id, reason },
          send_push: true,
        });
      }
    } catch (notifError) {
      console.error('[PaymentService] Error sending payment failure notification:', notifError);
    }

    const updatedPayment = await this.db.findOne('payments', { id: paymentId });
    return this.parsePaymentJson(updatedPayment);
  }

  // ============================================
  // MILESTONE PAYMENT METHODS
  // ============================================

  /**
   * Get payment for a specific milestone
   */
  async getMilestonePayment(milestoneId: string) {
    const payment = await this.db.findOne('payments', {
      milestone_id: milestoneId,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    return this.parsePaymentJson(payment);
  }

  /**
   * Create payment for a milestone
   */
  async createMilestonePayment(
    projectId: string,
    milestoneId: string,
    clientId: string,
    dto: CreateMilestonePaymentDto,
  ) {
    // Verify milestone exists
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    // Check if payment already exists for this milestone
    const existingPayment = await this.db.findOne('payments', {
      milestone_id: milestoneId,
    });

    if (existingPayment) {
      return this.parsePaymentJson(existingPayment);
    }

    // Calculate platform fee (e.g., 10% of amount)
    const PLATFORM_FEE_PERCENTAGE = 0.10;
    const platformFee = dto.amount * PLATFORM_FEE_PERCENTAGE;
    const netAmount = dto.amount - platformFee;

    const paymentData = {
      project_id: projectId,
      milestone_id: milestoneId,
      client_id: clientId,
      payment_type: 'milestone',
      amount: dto.amount,
      currency: dto.currency || 'USD',
      status: PaymentStatus.PENDING,
      description: dto.description || `Payment for milestone: ${milestone.name}`,
      platform_fee: platformFee,
      net_amount: netAmount,
      metadata: JSON.stringify({}),
      contract_id: null,
      payment_method: null,
      stripe_payment_intent_id: null,
      stripe_charge_id: null,
      transaction_id: null,
      transaction_date: null,
      invoice_number: null,
      invoice_url: null,
    };

    const payment = await this.db.insert('payments', paymentData);
    return this.parsePaymentJson(payment);
  }

  /**
   * Release milestone payment (after approval)
   */
  async releaseMilestonePayment(milestoneId: string) {
    const payment = await this.db.findOne('payments', {
      milestone_id: milestoneId,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found for this milestone');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Milestone payment has already been released');
    }

    // Check if milestone is approved
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone || milestone.status !== 'approved') {
      throw new BadRequestException('Milestone must be approved before releasing payment');
    }

    // Release the payment
    await this.db.update('payments', payment.id, {
      status: PaymentStatus.COMPLETED,
      transaction_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update milestone payment status
    await this.db.update('project_milestones', milestoneId, {
      payment_status: 'paid',
      payment_date: new Date().toISOString(),
    });

    // Send milestone payment release notification
    try {
      const project = await this.db.findOne('projects', { id: payment.project_id });

      // Notify developer about milestone payment release
      if (project?.developer_id) {
        await this.notificationsService.sendNotification({
          user_id: project.developer_id,
          type: NotificationType.FINANCE,
          title: '🎉 Milestone Payment Released',
          message: `Payment of $${payment.net_amount || payment.amount} for milestone "${milestone.name}" in "${project?.name || 'project'}" has been released.`,
          priority: NotificationPriority.HIGH,
          action_url: `/projects/${payment.project_id}/milestones`,
          data: { paymentId: payment.id, milestoneId, projectId: payment.project_id, amount: payment.net_amount || payment.amount },
          send_push: true,
        });
      }
    } catch (notifError) {
      console.error('[PaymentService] Error sending milestone payment notification:', notifError);
    }

    const updatedPayment = await this.db.findOne('payments', { id: payment.id });
    return this.parsePaymentJson(updatedPayment);
  }

  // ============================================
  // STRIPE INTEGRATION HELPERS
  // TODO: Implement Stripe webhook handlers
  // ============================================

  /**
   * Handle Stripe payment intent succeeded webhook
   * TODO: Create webhook endpoint in controller
   */
  async handleStripePaymentSuccess(paymentIntentId: string, stripeData: any) {
    const payment = await this.db.findOne('payments', {
      stripe_payment_intent_id: paymentIntentId,
    });

    if (!payment) {
      console.error(`Payment not found for Stripe payment intent: ${paymentIntentId}`);
      return;
    }

    await this.db.update('payments', payment.id, {
      status: PaymentStatus.COMPLETED,
      stripe_charge_id: stripeData.chargeId || null,
      transaction_id: stripeData.transactionId || paymentIntentId,
      transaction_date: new Date().toISOString(),
      metadata: JSON.stringify({ stripe_data: stripeData }),
      updated_at: new Date().toISOString(),
    });

    // Update associated milestone if exists
    if (payment.milestone_id) {
      await this.db.update('project_milestones', payment.milestone_id, {
        payment_status: 'paid',
        payment_date: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle Stripe payment intent failed webhook
   * TODO: Create webhook endpoint in controller
   */
  async handleStripePaymentFailure(paymentIntentId: string, errorData: any) {
    const payment = await this.db.findOne('payments', {
      stripe_payment_intent_id: paymentIntentId,
    });

    if (!payment) {
      console.error(`Payment not found for Stripe payment intent: ${paymentIntentId}`);
      return;
    }

    const metadata = this.safeJsonParse(payment.metadata) || {};
    metadata.stripe_error = errorData;
    metadata.failed_at = new Date().toISOString();

    await this.db.update('payments', payment.id, {
      status: PaymentStatus.FAILED,
      metadata: JSON.stringify(metadata),
      updated_at: new Date().toISOString(),
    });
  }

  // ============================================
  // ANALYTICS & REPORTING
  // ============================================

  /**
   * Get payment statistics for a project
   */
  async getProjectPaymentStats(projectId: string) {
    const payments = await this.db.findMany('payments', { project_id: projectId });

    const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalPaid = payments
      .filter(p => p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalPending = payments
      .filter(p => p.status === PaymentStatus.PENDING)
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalFailed = payments
      .filter(p => p.status === PaymentStatus.FAILED)
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return {
      totalPayments: payments.length,
      totalAmount,
      totalPaid,
      totalPending,
      totalFailed,
      completedPayments: payments.filter(p => p.status === PaymentStatus.COMPLETED).length,
      pendingPayments: payments.filter(p => p.status === PaymentStatus.PENDING).length,
      failedPayments: payments.filter(p => p.status === PaymentStatus.FAILED).length,
      payments: payments.map(p => this.parsePaymentJson(p)),
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private parsePaymentJson(payment: any) {
    if (!payment) return null;

    return {
      ...payment,
      metadata: this.safeJsonParse(payment.metadata),
    };
  }

  private safeJsonParse(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
