import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Stripe Service
 *
 * Handles all Stripe API operations for payment processing
 * including subscriptions, payment methods, invoices, and webhooks
 */
@Injectable()
export class StripeService {
  private stripe: any;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-09-30.clover' as any,
      typescript: true,
    });

    console.log('✅ Stripe SDK initialized');
  }

  /**
   * Get Stripe client instance
   */
  getClient(): any {
    return this.stripe;
  }

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  /**
   * Create or retrieve Stripe customer
   */
  async createOrGetCustomer(
    email: string,
    userId: string,
    metadata?: Record<string, string>
  ): Promise<any> {
    try {
      // Try to find existing customer by email
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Create new customer
      return await this.stripe.customers.create({
        email,
        metadata: {
          user_id: userId,
          ...metadata,
        },
      });
    } catch (error) {
      console.error('[StripeService] Error creating customer:', error);
      throw new BadRequestException('Failed to create Stripe customer');
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<any> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        throw new NotFoundException('Customer not found');
      }

      return customer as any;
    } catch (error) {
      console.error('[StripeService] Error retrieving customer:', error);
      throw new NotFoundException('Customer not found');
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(
    customerId: string,
    data: any
  ): Promise<any> {
    try {
      return await this.stripe.customers.update(customerId, data);
    } catch (error) {
      console.error('[StripeService] Error updating customer:', error);
      throw new BadRequestException('Failed to update customer');
    }
  }

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Create subscription
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    paymentMethodId?: string,
    metadata?: Record<string, string>
  ): Promise<any> {
    try {
      const subscriptionData: any = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: metadata || {},
      };

      // If payment method provided, set it as default
      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });

        await this.stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });

        subscriptionData.default_payment_method = paymentMethodId;
      }

      return await this.stripe.subscriptions.create(subscriptionData);
    } catch (error) {
      console.error('[StripeService] Error creating subscription:', error);
      throw new BadRequestException('Failed to create subscription');
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      });
    } catch (error) {
      console.error('[StripeService] Error retrieving subscription:', error);
      throw new NotFoundException('Subscription not found');
    }
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string,
    prorate: boolean = true
  ): Promise<any> {
    try {
      const subscription = await this.getSubscription(subscriptionId);

      return await this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: prorate ? 'create_prorations' : 'none',
      });
    } catch (error) {
      console.error('[StripeService] Error updating subscription:', error);
      throw new BadRequestException('Failed to update subscription');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<any> {
    try {
      if (immediate) {
        return await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at period end
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }
    } catch (error) {
      console.error('[StripeService] Error canceling subscription:', error);
      throw new BadRequestException('Failed to cancel subscription');
    }
  }

  /**
   * Resume subscription (remove cancel_at_period_end)
   */
  async resumeSubscription(subscriptionId: string): Promise<any> {
    try {
      return await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      console.error('[StripeService] Error resuming subscription:', error);
      throw new BadRequestException('Failed to resume subscription');
    }
  }

  /**
   * List customer subscriptions
   */
  async listCustomerSubscriptions(customerId: string): Promise<any[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.default_payment_method'],
      });

      return subscriptions.data;
    } catch (error) {
      console.error('[StripeService] Error listing subscriptions:', error);
      throw new BadRequestException('Failed to list subscriptions');
    }
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<any> {
    try {
      return await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (error) {
      console.error('[StripeService] Error attaching payment method:', error);
      throw new BadRequestException('Failed to attach payment method');
    }
  }

  /**
   * Detach payment method
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<any> {
    try {
      return await this.stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      console.error('[StripeService] Error detaching payment method:', error);
      throw new BadRequestException('Failed to detach payment method');
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<any> {
    try {
      return await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    } catch (error) {
      console.error('[StripeService] Error setting default payment method:', error);
      throw new BadRequestException('Failed to set default payment method');
    }
  }

  /**
   * List customer payment methods
   */
  async listPaymentMethods(
    customerId: string,
    type: 'card' = 'card'
  ): Promise<any[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type,
      });

      return paymentMethods.data;
    } catch (error) {
      console.error('[StripeService] Error listing payment methods:', error);
      throw new BadRequestException('Failed to list payment methods');
    }
  }

  // ============================================
  // INVOICE MANAGEMENT
  // ============================================

  /**
   * List customer invoices
   */
  async listInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      console.error('[StripeService] Error listing invoices:', error);
      throw new BadRequestException('Failed to list invoices');
    }
  }

  /**
   * Get invoice
   */
  async getInvoice(invoiceId: string): Promise<any> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      console.error('[StripeService] Error retrieving invoice:', error);
      throw new NotFoundException('Invoice not found');
    }
  }

  /**
   * Get upcoming invoice
   */
  async getUpcomingInvoice(customerId: string): Promise<any | null> {
    try {
      return await (this.stripe.invoices as any).retrieveUpcoming({
        customer: customerId,
      });
    } catch (error) {
      // No upcoming invoice is not an error
      return null;
    }
  }

  // ============================================
  // CHECKOUT SESSION
  // ============================================

  /**
   * Create checkout session
   */
  async createCheckoutSession(
    priceId: string,
    customerId?: string,
    customerEmail?: string,
    successUrl?: string,
    cancelUrl?: string,
    metadata?: Record<string, string>
  ): Promise<any> {
    try {
      const sessionData: any = {
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl || `${this.configService.get('FRONTEND_URL')}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${this.configService.get('FRONTEND_URL')}/pricing`,
        metadata: metadata || {},
      };

      if (customerId) {
        sessionData.customer = customerId;
      } else if (customerEmail) {
        sessionData.customer_email = customerEmail;
      }

      return await this.stripe.checkout.sessions.create(sessionData);
    } catch (error) {
      console.error('[StripeService] Error creating checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  /**
   * Get checkout session
   */
  async getCheckoutSession(sessionId: string): Promise<any> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer'],
      });
    } catch (error) {
      console.error('[StripeService] Error retrieving checkout session:', error);
      throw new NotFoundException('Checkout session not found');
    }
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  /**
   * Construct webhook event
   */
  constructWebhookEvent(
    payload: Buffer | string,
    signature: string
  ): any {
    try {
      const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
      }

      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error('[StripeService] Webhook signature verification failed:', error);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  // ============================================
  // PRICE MANAGEMENT
  // ============================================

  /**
   * Get price details
   */
  async getPrice(priceId: string): Promise<any> {
    try {
      return await this.stripe.prices.retrieve(priceId);
    } catch (error) {
      console.error('[StripeService] Error retrieving price:', error);
      throw new NotFoundException('Price not found');
    }
  }

  /**
   * List all prices
   */
  async listPrices(productId?: string): Promise<any[]> {
    try {
      const params: any = {
        active: true,
      };

      if (productId) {
        params.product = productId;
      }

      const prices = await this.stripe.prices.list(params);
      return prices.data;
    } catch (error) {
      console.error('[StripeService] Error listing prices:', error);
      throw new BadRequestException('Failed to list prices');
    }
  }
}
