/**
 * Stripe payment provider — the production default.
 *
 *   PAYMENT_PROVIDER=stripe
 *   STRIPE_SECRET_KEY=sk_live_...       (or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * Uses Stripe Checkout Sessions for the payment flow — the simplest
 * path to a working checkout that supports cards, Apple Pay, Google
 * Pay, and every other payment method the customer's region allows.
 *
 * **Marketplace splits** are supported via Stripe Connect
 * `transfer_data.destination` — the line items include a
 * `vendorAccountId` (connected account id), and the provider
 * automatically splits the charge. For orders spanning multiple
 * vendors, the simplification here is: the first vendor gets the
 * full transfer minus the platform fee, and manual reconciliation
 * handles the rest. A follow-up PR can add proper multi-vendor
 * PaymentIntents with `transfer_group` + separate transfers.
 *
 * Pure REST via fetch — no SDK dep. Stripe's REST API uses
 * form-urlencoded bodies with nested keys like
 * `line_items[0][price_data][unit_amount]=1000`. The provider
 * builds the nested form encoding from a flat object via a
 * recursive walker (same pattern as the tax adapter's
 * stripe-tax provider).
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentInfo,
  PaymentProvider,
  PaymentProviderNotConfiguredError,
  PaymentStatus,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  private readonly logger = new Logger('StripeProvider');

  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('STRIPE_SECRET_KEY', '');
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', '');

    if (this.isAvailable()) {
      this.logger.log(
        `Stripe provider configured (${this.secretKey.startsWith('sk_test') ? 'test mode' : 'production'})`,
      );
    } else {
      this.logger.warn('Stripe provider selected but STRIPE_SECRET_KEY missing');
    }
  }

  isAvailable(): boolean {
    return !!this.secretKey;
  }

  /**
   * Build Stripe-style form-urlencoded body with nested keys:
   *   { line_items: [{ price_data: { currency: 'usd' } }] }
   *   → "line_items[0][price_data][currency]=usd"
   */
  private encodeForm(data: Record<string, any>): string {
    const params = new URLSearchParams();
    const walk = (prefix: string, value: any) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
      } else if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          walk(`${prefix}[${k}]`, v);
        }
      } else {
        params.append(prefix, String(value));
      }
    };
    for (const [k, v] of Object.entries(data)) walk(k, v);
    return params.toString();
  }

  private async stripeApi(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, any>,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new PaymentProviderNotConfiguredError('stripe', [
        'STRIPE_SECRET_KEY',
      ]);
    }
    const res = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body ? this.encodeForm(body) : undefined,
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `Stripe API ${method} ${path} failed: ${res.status} ${json.error?.message ?? JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // Marketplace split: if all line items share a single
    // vendorAccountId, use Stripe Connect `transfer_data.destination`
    // + `application_fee_amount` to split the charge automatically.
    // For multi-vendor carts, we use transfer_group and leave
    // reconciliation to a follow-up PR.
    const vendorIds = new Set(
      input.lineItems
        .map((li) => li.vendorAccountId)
        .filter((v): v is string => !!v),
    );
    const singleVendor = vendorIds.size === 1 ? [...vendorIds][0] : undefined;

    const body: Record<string, any> = {
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.orderReference,
      customer_email: input.customer.email,
      line_items: input.lineItems.map((li) => ({
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: { name: li.description, metadata: { productId: li.productId } },
          unit_amount: li.unitAmount,
        },
        quantity: li.quantity,
      })),
      metadata: {
        order_reference: input.orderReference,
        ...input.metadata,
      },
    };

    if (singleVendor && input.platformFeeAmount !== undefined) {
      body.payment_intent_data = {
        application_fee_amount: input.platformFeeAmount,
        transfer_data: { destination: singleVendor },
      };
    } else if (vendorIds.size > 1) {
      // Multi-vendor → use a transfer_group so a follow-up job can
      // create individual transfers after capture.
      body.payment_intent_data = {
        transfer_group: `order_${input.orderReference}`,
      };
    }

    const session = await this.stripeApi('POST', '/checkout/sessions', body);
    return {
      sessionId: session.id,
      checkoutUrl: session.url,
      provider: 'stripe',
      status: 'pending',
    };
  }

  async getPayment(paymentId: string): Promise<PaymentInfo | null> {
    try {
      // paymentId here is the Checkout Session id OR a PaymentIntent id.
      // Try Checkout Session first.
      let session: any = null;
      if (paymentId.startsWith('cs_')) {
        session = await this.stripeApi(
          'GET',
          `/checkout/sessions/${encodeURIComponent(paymentId)}`,
        );
        if (session.payment_intent) {
          const pi = await this.stripeApi(
            'GET',
            `/payment_intents/${session.payment_intent}`,
          );
          return this.translatePaymentIntent(pi, session.client_reference_id);
        }
      } else if (paymentId.startsWith('pi_')) {
        const pi = await this.stripeApi(
          'GET',
          `/payment_intents/${encodeURIComponent(paymentId)}`,
        );
        return this.translatePaymentIntent(pi);
      }
      return null;
    } catch (e: any) {
      if (/404/.test(e.message)) return null;
      throw e;
    }
  }

  private translatePaymentIntent(
    pi: any,
    orderReference?: string,
  ): PaymentInfo {
    return {
      paymentId: pi.id,
      status: this.mapStatus(pi.status),
      amount: pi.amount,
      currency: pi.currency?.toUpperCase() ?? 'USD',
      orderReference: orderReference ?? pi.metadata?.order_reference ?? '',
      capturedAt: pi.charges?.data?.[0]?.created
        ? new Date(pi.charges.data[0].created * 1000).toISOString()
        : undefined,
      method: pi.payment_method_types?.[0] ?? 'card',
      provider: 'stripe',
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const body: Record<string, any> = { payment_intent: input.paymentId };
    if (input.amount !== undefined) body.amount = input.amount;
    if (input.reason) body.reason = input.reason;

    const refund = await this.stripeApi('POST', '/refunds', body);
    return {
      refundId: refund.id,
      amount: refund.amount ?? 0,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending',
      provider: 'stripe',
    };
  }

  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<WebhookEvent | null> {
    // Stripe uses Stripe-Signature header with scheme:
    //   t=<timestamp>,v1=<hmac_sha256_of_timestamp.rawBody>
    if (this.webhookSecret && signature) {
      const parts = Object.fromEntries(
        signature.split(',').map((s) => {
          const [k, v] = s.split('=');
          return [k, v];
        }),
      );
      const timestamp = parts.t;
      const v1 = parts.v1;
      if (!timestamp || !v1) {
        throw new Error('Stripe webhook signature malformed');
      }
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) {
        throw new Error('Stripe webhook signature mismatch');
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const kind = this.mapEventKind(payload.type);
    if (kind === 'unknown') return null;

    const obj = payload.data?.object ?? {};
    return {
      kind,
      paymentId: obj.id ?? '',
      orderReference:
        obj.client_reference_id ?? obj.metadata?.order_reference,
      amount: obj.amount_total ?? obj.amount,
      currency: obj.currency?.toUpperCase(),
      raw: payload,
    };
  }

  private mapStatus(raw?: string): PaymentStatus {
    switch (raw) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'pending';
      case 'processing':
        return 'processing';
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  private mapEventKind(raw?: string): WebhookEvent['kind'] {
    switch (raw) {
      case 'checkout.session.completed':
      case 'payment_intent.succeeded':
        return 'payment.succeeded';
      case 'payment_intent.payment_failed':
      case 'checkout.session.async_payment_failed':
        return 'payment.failed';
      case 'charge.refunded':
      case 'refund.created':
        return 'payment.refunded';
      case 'checkout.session.expired':
        return 'payment.expired';
      default:
        return 'unknown';
    }
  }
}
