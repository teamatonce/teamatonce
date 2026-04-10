import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/dto';
import Stripe from 'stripe';

/**
 * Payment Service
 *
 * Handles database persistence for Stripe webhook events
 * Manages subscriptions, payment methods, payments, and invoices in the database
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Create or update subscription from Stripe subscription object
   */
  async upsertSubscription(subscription: any): Promise<any> {
    try {
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

      // Get company_id from stripe customer metadata
      const companyId = await this.getCompanyIdFromStripeCustomer(customerId);

      // Get user_id from stripe customer metadata
      const userId = await this.getUserIdFromStripeCustomer(customerId);

      if (!companyId || !userId) {
        this.logger.warn(`Cannot upsert subscription ${subscription.id}: missing company_id or user_id in customer metadata`);
        return null;
      }

      // Get price_id from subscription items
      const priceId = subscription.items.data[0]?.price?.id || null;

      // Get plan name from price metadata or product name
      const planName = subscription.items.data[0]?.price?.metadata?.plan_name
        || subscription.items.data[0]?.price?.nickname
        || null;

      const subscriptionData = {
        company_id: companyId,
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        price_id: priceId,
        plan_name: planName,
        billing_interval: subscription.items.data[0]?.price?.recurring?.interval || null,
        status: subscription.status,
        current_period_start: (subscription as any).current_period_start
          ? new Date((subscription as any).current_period_start * 1000).toISOString()
          : null,
        current_period_end: (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        ended_at: subscription.ended_at
          ? new Date(subscription.ended_at * 1000).toISOString()
          : null,
        trial_start: subscription.trial_start
          ? new Date(subscription.trial_start * 1000).toISOString()
          : null,
        trial_end: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        metadata: JSON.stringify(subscription.metadata || {}),
        updated_at: new Date().toISOString(),
      };

      // Check if subscription exists
      const existing = await this.db.findOne('subscriptions', {
        stripe_subscription_id: subscription.id,
      });

      if (existing) {
        // Update existing subscription
        await this.db.update('subscriptions', existing.id, subscriptionData);
        this.logger.log(`Updated subscription ${subscription.id} in database`);

        // Notify user about subscription status change
        if (existing.status !== subscription.status && userId) {
          try {
            const statusMessages: Record<string, { title: string; message: string; type: NotificationType; priority: NotificationPriority }> = {
              active: {
                title: 'Subscription Activated',
                message: `Your ${planName || 'subscription'} is now active!`,
                type: NotificationType.ACHIEVEMENT,
                priority: NotificationPriority.HIGH,
              },
              canceled: {
                title: 'Subscription Cancelled',
                message: `Your ${planName || 'subscription'} has been cancelled. Access will continue until the end of your billing period.`,
                type: NotificationType.UPDATE,
                priority: NotificationPriority.HIGH,
              },
              past_due: {
                title: 'Payment Past Due',
                message: `Your ${planName || 'subscription'} payment is past due. Please update your payment method to avoid service interruption.`,
                type: NotificationType.REMINDER,
                priority: NotificationPriority.URGENT,
              },
              unpaid: {
                title: 'Subscription Payment Failed',
                message: `We couldn't process payment for your ${planName || 'subscription'}. Please update your payment method.`,
                type: NotificationType.REMINDER,
                priority: NotificationPriority.URGENT,
              },
            };

            const statusInfo = statusMessages[subscription.status];
            if (statusInfo) {
              await this.notificationsService.sendNotification({
                user_id: userId,
                type: statusInfo.type,
                title: statusInfo.title,
                message: statusInfo.message,
                priority: statusInfo.priority,
                action_url: `/settings/billing`,
                data: { subscriptionId: subscription.id, status: subscription.status, planName },
                send_push: true,
                send_email: subscription.status === 'past_due' || subscription.status === 'unpaid',
              });
            }
          } catch (notifError) {
            this.logger.error(`Failed to send subscription notification: ${notifError.message}`);
          }
        }

        return { ...existing, ...subscriptionData };
      } else {
        // Create new subscription
        const newSubscription = await this.db.insert('subscriptions', {
          ...subscriptionData,
          created_at: new Date().toISOString(),
        });
        this.logger.log(`Created subscription ${subscription.id} in database`);

        // Notify user about new subscription
        if (userId && subscription.status === 'active') {
          try {
            await this.notificationsService.sendNotification({
              user_id: userId,
              type: NotificationType.ACHIEVEMENT,
              title: 'Welcome to Your New Plan!',
              message: `Your ${planName || 'subscription'} has been successfully activated. Thank you for subscribing!`,
              priority: NotificationPriority.HIGH,
              action_url: `/settings/billing`,
              data: { subscriptionId: subscription.id, planName },
              send_push: true,
              send_email: true,
            });
          } catch (notifError) {
            this.logger.error(`Failed to send new subscription notification: ${notifError.message}`);
          }
        }

        return newSubscription;
      }
    } catch (error) {
      this.logger.error(`Error upserting subscription ${subscription.id}:`, error);
      throw error;
    }
  }

  /**
   * Delete subscription from database
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    try {
      const existing = await this.db.findOne('subscriptions', {
        stripe_subscription_id: subscriptionId,
      });

      if (existing) {
        await this.db.update('subscriptions', existing.id, {
          status: 'canceled',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        this.logger.log(`Marked subscription ${subscriptionId} as canceled in database`);
      }
    } catch (error) {
      this.logger.error(`Error deleting subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  /**
   * Create or update payment method from Stripe payment method object
   */
  async upsertPaymentMethod(paymentMethod: any): Promise<any> {
    try {
      const customerId = typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

      if (!customerId) {
        this.logger.warn(`Cannot upsert payment method ${paymentMethod.id}: no customer attached`);
        return null;
      }

      // Get company_id and user_id from stripe customer metadata
      const companyId = await this.getCompanyIdFromStripeCustomer(customerId);
      const userId = await this.getUserIdFromStripeCustomer(customerId);

      if (!companyId || !userId) {
        this.logger.warn(`Cannot upsert payment method ${paymentMethod.id}: missing company_id or user_id`);
        return null;
      }

      const paymentMethodData = {
        company_id: companyId,
        user_id: userId,
        stripe_payment_method_id: paymentMethod.id,
        stripe_customer_id: customerId,
        type: paymentMethod.type,
        last4: paymentMethod.card?.last4 || null,
        brand: paymentMethod.card?.brand || null,
        exp_month: paymentMethod.card?.exp_month || null,
        exp_year: paymentMethod.card?.exp_year || null,
        is_active: true,
        metadata: JSON.stringify(paymentMethod.metadata || {}),
        updated_at: new Date().toISOString(),
      };

      // Check if payment method exists
      const existing = await this.db.findOne('payment_methods', {
        stripe_payment_method_id: paymentMethod.id,
      });

      if (existing) {
        // Update existing payment method
        await this.db.update('payment_methods', existing.id, paymentMethodData);
        this.logger.log(`Updated payment method ${paymentMethod.id} in database`);
        return { ...existing, ...paymentMethodData };
      } else {
        // Create new payment method
        const newPaymentMethod = await this.db.insert('payment_methods', {
          ...paymentMethodData,
          is_default: false,
          created_at: new Date().toISOString(),
        });
        this.logger.log(`Created payment method ${paymentMethod.id} in database`);
        return newPaymentMethod;
      }
    } catch (error) {
      this.logger.error(`Error upserting payment method ${paymentMethod.id}:`, error);
      throw error;
    }
  }

  /**
   * Remove payment method from database
   */
  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      const existing = await this.db.findOne('payment_methods', {
        stripe_payment_method_id: paymentMethodId,
      });

      if (existing) {
        await this.db.update('payment_methods', existing.id, {
          is_active: false,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        this.logger.log(`Removed payment method ${paymentMethodId} from database`);
      }
    } catch (error) {
      this.logger.error(`Error removing payment method ${paymentMethodId}:`, error);
      throw error;
    }
  }

  /**
   * Set payment method as default
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      // Get company_id from customer
      const companyId = await this.getCompanyIdFromStripeCustomer(customerId);

      if (!companyId) {
        this.logger.warn(`Cannot set default payment method: missing company_id`);
        return;
      }

      // First, unset all existing default payment methods for this company
      const existingMethods = await this.db.findMany('payment_methods', {
        company_id: companyId,
        is_default: true,
      });

      for (const method of existingMethods) {
        await this.db.update('payment_methods', method.id, {
          is_default: false,
          updated_at: new Date().toISOString(),
        });
      }

      // Set the new default payment method
      const newDefault = await this.db.findOne('payment_methods', {
        stripe_payment_method_id: paymentMethodId,
      });

      if (newDefault) {
        await this.db.update('payment_methods', newDefault.id, {
          is_default: true,
          updated_at: new Date().toISOString(),
        });
        this.logger.log(`Set payment method ${paymentMethodId} as default`);
      }
    } catch (error) {
      this.logger.error(`Error setting default payment method:`, error);
      throw error;
    }
  }

  // ============================================
  // PAYMENT INTENT MANAGEMENT
  // ============================================

  /**
   * Create or update payment from payment intent
   */
  async upsertPaymentFromIntent(paymentIntent: any): Promise<any> {
    try {
      const customerId = typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

      if (!customerId) {
        this.logger.warn(`Cannot upsert payment from intent ${paymentIntent.id}: no customer`);
        return null;
      }

      // Get user_id from customer metadata
      const userId = await this.getUserIdFromStripeCustomer(customerId);

      if (!userId) {
        this.logger.warn(`Cannot upsert payment: missing user_id`);
        return null;
      }

      // Extract project_id from metadata if available
      const projectId = paymentIntent.metadata?.project_id || null;
      const milestoneId = paymentIntent.metadata?.milestone_id || null;

      const paymentData = {
        project_id: projectId,
        milestone_id: milestoneId,
        client_id: userId,
        payment_type: paymentIntent.metadata?.payment_type || 'invoice',
        amount: paymentIntent.amount / 100, // Convert from cents to dollars
        currency: paymentIntent.currency.toUpperCase(),
        status: this.mapPaymentIntentStatus(paymentIntent.status),
        payment_method: 'stripe',
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id || null,
        description: paymentIntent.description || null,
        metadata: JSON.stringify(paymentIntent.metadata || {}),
        updated_at: new Date().toISOString(),
      };

      // Check if payment exists
      const existing = await this.db.findOne('payments', {
        stripe_payment_intent_id: paymentIntent.id,
      });

      if (existing) {
        // Update existing payment
        await this.db.update('payments', existing.id, paymentData);
        this.logger.log(`Updated payment ${paymentIntent.id} in database`);
        return { ...existing, ...paymentData };
      } else {
        // Create new payment
        const newPayment = await this.db.insert('payments', {
          ...paymentData,
          created_at: new Date().toISOString(),
        });
        this.logger.log(`Created payment ${paymentIntent.id} in database`);
        return newPayment;
      }
    } catch (error) {
      this.logger.error(`Error upserting payment from intent ${paymentIntent.id}:`, error);
      throw error;
    }
  }

  // ============================================
  // INVOICE MANAGEMENT
  // ============================================

  /**
   * Update payment record from invoice
   */
  async updatePaymentFromInvoice(invoice: any): Promise<any> {
    try {
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

      if (!customerId) {
        this.logger.warn(`Cannot update payment from invoice ${invoice.id}: no customer`);
        return null;
      }

      const userId = await this.getUserIdFromStripeCustomer(customerId);

      if (!userId) {
        this.logger.warn(`Cannot update payment: missing user_id`);
        return null;
      }

      // Try to find existing payment by payment_intent_id
      let payment = null;
      const invoicePaymentIntent = (invoice as any).payment_intent;
      if (invoicePaymentIntent) {
        const paymentIntentId = typeof invoicePaymentIntent === 'string'
          ? invoicePaymentIntent
          : invoicePaymentIntent.id;

        payment = await this.db.findOne('payments', {
          stripe_payment_intent_id: paymentIntentId,
        });
      }

      const paymentData = {
        client_id: userId,
        payment_type: 'invoice',
        amount: invoice.amount_paid / 100, // Convert from cents
        currency: invoice.currency.toUpperCase(),
        status: invoice.status === 'paid' ? 'completed' :
               invoice.status === 'open' ? 'pending' :
               invoice.status === 'void' ? 'failed' : 'pending',
        payment_method: 'stripe',
        invoice_number: invoice.number || null,
        invoice_url: invoice.hosted_invoice_url || invoice.invoice_pdf || null,
        transaction_date: invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
          : null,
        description: invoice.description || null,
        metadata: JSON.stringify(invoice.metadata || {}),
        updated_at: new Date().toISOString(),
      };

      if (payment) {
        // Update existing payment
        await this.db.update('payments', payment.id, paymentData);
        this.logger.log(`Updated payment from invoice ${invoice.id}`);

        // Notify user about paid invoice
        if (invoice.status === 'paid' && userId) {
          try {
            await this.notificationsService.sendNotification({
              user_id: userId,
              type: NotificationType.FINANCE,
              title: 'Payment Successful',
              message: `Your payment of $${(invoice.amount_paid / 100).toFixed(2)} has been processed successfully.${invoice.number ? ` Invoice #${invoice.number}` : ''}`,
              priority: NotificationPriority.NORMAL,
              action_url: invoice.hosted_invoice_url || `/settings/billing`,
              data: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.number,
                amount: invoice.amount_paid / 100,
                invoiceUrl: invoice.hosted_invoice_url,
              },
              send_email: true,
            });
          } catch (notifError) {
            this.logger.error(`Failed to send invoice payment notification: ${notifError.message}`);
          }
        }

        return { ...payment, ...paymentData };
      } else {
        // Create new payment record for the invoice
        const newPayment = await this.db.insert('payments', {
          ...paymentData,
          project_id: invoice.metadata?.project_id || null,
          created_at: new Date().toISOString(),
        });
        this.logger.log(`Created payment from invoice ${invoice.id}`);

        // Notify user about paid invoice for new records
        if (invoice.status === 'paid' && userId) {
          try {
            await this.notificationsService.sendNotification({
              user_id: userId,
              type: NotificationType.FINANCE,
              title: 'Payment Successful',
              message: `Your payment of $${(invoice.amount_paid / 100).toFixed(2)} has been processed successfully.${invoice.number ? ` Invoice #${invoice.number}` : ''}`,
              priority: NotificationPriority.NORMAL,
              action_url: invoice.hosted_invoice_url || `/settings/billing`,
              data: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.number,
                amount: invoice.amount_paid / 100,
                invoiceUrl: invoice.hosted_invoice_url,
              },
              send_email: true,
            });
          } catch (notifError) {
            this.logger.error(`Failed to send invoice payment notification: ${notifError.message}`);
          }
        }

        return newPayment;
      }
    } catch (error) {
      this.logger.error(`Error updating payment from invoice ${invoice.id}:`, error);
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get company_id from Stripe customer metadata
   */
  private async getCompanyIdFromStripeCustomer(customerId: string): Promise<string | null> {
    try {
      // Try to find company by stripe_customer_id
      const company = await this.db.findOne('developer_companies', {
        stripe_customer_id: customerId,
      });

      return company?.id || null;
    } catch (error) {
      this.logger.error(`Error getting company_id from customer ${customerId}:`, error);
      return null;
    }
  }

  /**
   * Get user_id from Stripe customer metadata
   */
  private async getUserIdFromStripeCustomer(customerId: string): Promise<string | null> {
    try {
      // Try to find company by stripe_customer_id and get owner_id
      const company = await this.db.findOne('developer_companies', {
        stripe_customer_id: customerId,
      });

      return company?.owner_id || null;
    } catch (error) {
      this.logger.error(`Error getting user_id from customer ${customerId}:`, error);
      return null;
    }
  }

  /**
   * Map Stripe payment intent status to our payment status
   */
  private mapPaymentIntentStatus(status: string): string {
    switch (status) {
      case 'succeeded':
        return 'completed';
      case 'processing':
        return 'processing';
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'pending';
      case 'canceled':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Update company's stripe_customer_id
   */
  async updateCompanyStripeCustomerId(companyId: string, stripeCustomerId: string): Promise<void> {
    try {
      await this.db.update('developer_companies', companyId, {
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      });
      this.logger.log(`Updated company ${companyId} with Stripe customer ${stripeCustomerId}`);
    } catch (error) {
      this.logger.error(`Error updating company stripe_customer_id:`, error);
      throw error;
    }
  }
}
