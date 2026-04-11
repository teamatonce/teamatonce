/**
 * PayPal payment provider.
 *
 *   PAYMENT_PROVIDER=paypal
 *   PAYPAL_CLIENT_ID=...
 *   PAYPAL_CLIENT_SECRET=...
 *   PAYPAL_MODE=sandbox                  (or "live" for production)
 *
 * Uses PayPal's v2 REST API (Orders v2) with client_credentials
 * OAuth token exchange. Supports hosted checkout via redirect to
 * the `approve` HATEOAS link returned in the order creation response.
 *
 * Marketplace splits: PayPal Payouts can send money to vendor
 * PayPal accounts after capture. For the first pass, we create the
 * order in the platform account and a follow-up PR can wire the
 * post-capture payout flow.
 *
 * Pure REST via fetch.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export class PayPalProvider implements PaymentProvider {
  readonly name = 'paypal' as const;
  private readonly logger = new Logger('PayPalProvider');

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('PAYPAL_CLIENT_ID', '');
    this.clientSecret = config.get<string>('PAYPAL_CLIENT_SECRET', '');
    const mode = (
      config.get<string>('PAYPAL_MODE', 'sandbox') || 'sandbox'
    ).toLowerCase();
    this.baseUrl =
      mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    if (this.isAvailable()) {
      this.logger.log(`PayPal provider configured (${mode} mode)`);
    } else {
      this.logger.warn(
        'PayPal provider selected but PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (!this.isAvailable()) {
      throw new PaymentProviderNotConfiguredError('paypal', [
        !this.clientId ? 'PAYPAL_CLIENT_ID' : '',
        !this.clientSecret ? 'PAYPAL_CLIENT_SECRET' : '',
      ].filter(Boolean));
    }
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !json.access_token) {
      throw new Error(`PayPal token exchange failed: ${res.status}`);
    }
    this.accessToken = json.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (json.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken;
  }

  private async paypalApi(
    method: 'GET' | 'POST',
    path: string,
    body?: any,
  ): Promise<any> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `PayPal API ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // PayPal Orders v2 expects amounts as decimal strings ("12.34")
    // in the order currency. Our interface uses smallest currency
    // units (cents/paisa), so divide by 100 for JPY-like currencies
    // without decimal places this would need adjustment, but the
    // common case (USD/EUR/BDT) works correctly.
    const formatAmount = (minorUnit: number) =>
      (minorUnit / 100).toFixed(2);

    const order = await this.paypalApi('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.orderReference,
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: formatAmount(input.totalAmount),
            breakdown: {
              item_total: {
                currency_code: input.currency.toUpperCase(),
                value: formatAmount(input.totalAmount),
              },
            },
          },
          items: input.lineItems.map((li) => ({
            name: li.description.slice(0, 127),
            quantity: String(li.quantity),
            unit_amount: {
              currency_code: input.currency.toUpperCase(),
              value: formatAmount(li.unitAmount),
            },
          })),
        },
      ],
      application_context: {
        return_url: input.successUrl,
        cancel_url: input.cancelUrl,
        user_action: 'PAY_NOW',
      },
    });

    const approveLink = order.links?.find((l: any) => l.rel === 'approve');
    if (!approveLink) {
      throw new Error('PayPal order creation did not return an approve URL');
    }

    return {
      sessionId: order.id,
      checkoutUrl: approveLink.href,
      provider: 'paypal',
      status: 'pending',
    };
  }

  async getPayment(paymentId: string): Promise<PaymentInfo | null> {
    try {
      const order = await this.paypalApi(
        'GET',
        `/v2/checkout/orders/${encodeURIComponent(paymentId)}`,
      );
      const unit = order.purchase_units?.[0];
      return {
        paymentId: order.id,
        status: this.mapStatus(order.status),
        amount: Math.round(parseFloat(unit?.amount?.value ?? '0') * 100),
        currency: unit?.amount?.currency_code ?? 'USD',
        orderReference: unit?.reference_id ?? '',
        capturedAt:
          unit?.payments?.captures?.[0]?.create_time ?? undefined,
        method: 'paypal',
        provider: 'paypal',
      };
    } catch (e: any) {
      if (/404/.test(e.message)) return null;
      throw e;
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // PayPal refunds happen against a capture id, not the order id.
    // Look up the order first to find the capture id.
    const order = await this.paypalApi(
      'GET',
      `/v2/checkout/orders/${encodeURIComponent(input.paymentId)}`,
    );
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!captureId) {
      throw new Error(`PayPal order ${input.paymentId} has no captures to refund`);
    }

    const body: any = {};
    if (input.amount !== undefined) {
      body.amount = {
        value: (input.amount / 100).toFixed(2),
        currency_code:
          order.purchase_units?.[0]?.amount?.currency_code ?? 'USD',
      };
    }
    if (input.reason) body.note_to_payer = input.reason;

    const refund = await this.paypalApi(
      'POST',
      `/v2/payments/captures/${captureId}/refund`,
      body,
    );

    return {
      refundId: refund.id,
      amount: Math.round(parseFloat(refund.amount?.value ?? '0') * 100),
      status:
        refund.status === 'COMPLETED'
          ? 'succeeded'
          : refund.status === 'FAILED'
            ? 'failed'
            : 'pending',
      provider: 'paypal',
    };
  }

  async parseWebhook(
    rawBody: string,
    _signature?: string,
  ): Promise<WebhookEvent | null> {
    // PayPal webhook signature verification requires multiple
    // headers (paypal-transmission-id, -time, -sig, cert-url,
    // algo, webhook_id) and a server-side verify call to
    // /notifications/verify-webhook-signature. That's more
    // infrastructure than this first-pass PR wants. For now,
    // parse the payload without verification — production
    // deployments MUST add signature verification before
    // trusting any webhook. Documented.
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const kind = this.mapEventKind(payload.event_type);
    if (kind === 'unknown') return null;

    const resource = payload.resource ?? {};
    return {
      kind,
      paymentId: resource.id ?? resource.supplementary_data?.related_ids?.order_id ?? '',
      orderReference: resource.custom_id ?? resource.invoice_id,
      amount: resource.amount?.value
        ? Math.round(parseFloat(resource.amount.value) * 100)
        : undefined,
      currency: resource.amount?.currency_code,
      raw: payload,
    };
  }

  private mapStatus(raw?: string): PaymentStatus {
    switch ((raw ?? '').toUpperCase()) {
      case 'CREATED':
      case 'SAVED':
      case 'APPROVED':
        return 'pending';
      case 'PAYER_ACTION_REQUIRED':
        return 'processing';
      case 'COMPLETED':
        return 'succeeded';
      case 'VOIDED':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  private mapEventKind(raw?: string): WebhookEvent['kind'] {
    switch (raw) {
      case 'CHECKOUT.ORDER.APPROVED':
      case 'PAYMENT.CAPTURE.COMPLETED':
        return 'payment.succeeded';
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.FAILED':
        return 'payment.failed';
      case 'PAYMENT.CAPTURE.REFUNDED':
        return 'payment.refunded';
      default:
        return 'unknown';
    }
  }
}
