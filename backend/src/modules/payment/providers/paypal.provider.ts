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
  private readonly webhookId: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('PAYPAL_CLIENT_ID', '');
    this.clientSecret = config.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.webhookId = config.get<string>('PAYPAL_WEBHOOK_ID', '');
    const mode = (
      config.get<string>('PAYPAL_MODE', 'sandbox') || 'sandbox'
    ).toLowerCase();
    this.baseUrl =
      mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    if (this.isAvailable()) {
      this.logger.log(`PayPal provider configured (${mode} mode)`);
      if (!this.webhookId) {
        this.logger.warn(
          'PAYPAL_WEBHOOK_ID is not set — parseWebhook will reject every inbound event to prevent forged notifications. Set PAYPAL_WEBHOOK_ID from your PayPal developer dashboard before enabling webhook handling.',
        );
      }
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

  /**
   * Currencies that PayPal accepts with zero decimal places. Our
   * interface uses integer minor units (cents/paisa) throughout, so
   * a JPY "¥1000" amount arrives as `1000` and must be emitted as
   * "1000" — NOT "10.00" (which would be 100× lower). ISO 4217 lists
   * the decimal count for every currency; we hardcode the zero-
   * decimal list since it's stable and small.
   */
  private static readonly ZERO_DECIMAL_CURRENCIES = new Set<string>([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG',
    'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
  ]);

  private formatAmount(minorUnit: number, currency: string): string {
    const iso = currency.toUpperCase();
    if (PayPalProvider.ZERO_DECIMAL_CURRENCIES.has(iso)) {
      return String(Math.round(minorUnit));
    }
    return (minorUnit / 100).toFixed(2);
  }

  private parseAmount(value: string, currency: string): number {
    const iso = currency.toUpperCase();
    if (PayPalProvider.ZERO_DECIMAL_CURRENCIES.has(iso)) {
      return Math.round(parseFloat(value));
    }
    return Math.round(parseFloat(value) * 100);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // PayPal Orders v2 expects amounts as decimal strings in the
    // order currency. For 2-decimal currencies that's "12.34"; for
    // zero-decimal currencies (JPY/KRW/VND/...) that's the integer
    // as a string. Our interface uses integer minor units, so the
    // formatAmount() helper dispatches on ISO 4217.
    const formatAmount = (minorUnit: number) =>
      this.formatAmount(minorUnit, input.currency);

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
      const currency = unit?.amount?.currency_code ?? 'USD';
      return {
        paymentId: order.id,
        status: this.mapStatus(order.status),
        amount: this.parseAmount(unit?.amount?.value ?? '0', currency),
        currency,
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

    const currency =
      order.purchase_units?.[0]?.amount?.currency_code ?? 'USD';
    const body: any = {};
    if (input.amount !== undefined) {
      body.amount = {
        value: this.formatAmount(input.amount, currency),
        currency_code: currency,
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
      amount: this.parseAmount(refund.amount?.value ?? '0', currency),
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
    signature?: string,
  ): Promise<WebhookEvent | null> {
    // PayPal webhook signature verification requires calling
    //   POST /v1/notifications/verify-webhook-signature
    // with the webhook_id from PayPal's dashboard + the five
    // transmission headers + the raw body. We receive those
    // headers from the controller as a JSON-encoded bundle in
    // the `signature` parameter:
    //
    //   signature = JSON.stringify({
    //     'paypal-transmission-id': req.headers['paypal-transmission-id'],
    //     'paypal-transmission-time': ...,
    //     'paypal-transmission-sig': ...,
    //     'paypal-cert-url': ...,
    //     'paypal-auth-algo': ...,
    //   })
    //
    // Fail-closed: if PAYPAL_WEBHOOK_ID is unset OR any header is
    // missing OR the verify call returns SUCCESS:false, reject.

    if (!this.webhookId) {
      throw new Error(
        'PayPal webhook verification requires PAYPAL_WEBHOOK_ID (get it from https://developer.paypal.com/dashboard/webhooks). Webhook handler is disabled until this env var is set.',
      );
    }

    if (!signature) {
      throw new Error(
        'PayPal webhook signature bundle missing. Controller must forward paypal-transmission-* headers as a JSON-encoded string in the signature parameter.',
      );
    }

    let headers: Record<string, string>;
    try {
      headers = JSON.parse(signature);
    } catch {
      throw new Error('PayPal webhook signature bundle is not valid JSON');
    }

    const normalize = (obj: Record<string, string>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
      return out;
    };
    const h = normalize(headers);
    const required = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-transmission-sig',
      'paypal-cert-url',
      'paypal-auth-algo',
    ];
    const missing = required.filter((k) => !h[k]);
    if (missing.length > 0) {
      throw new Error(
        `PayPal webhook headers missing: ${missing.join(', ')}`,
      );
    }

    // Parse the body FIRST so we can pass the parsed webhook_event
    // to the verify endpoint as PayPal expects.
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error('PayPal webhook body is not valid JSON');
    }

    // Call PayPal's verification endpoint. This is fail-closed —
    // any non-200, any non-SUCCESS verification_status, or any
    // network error throws and prevents the event from being
    // returned to downstream code.
    const verifyRes = await this.paypalApi(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: h['paypal-auth-algo'],
        cert_url: h['paypal-cert-url'],
        transmission_id: h['paypal-transmission-id'],
        transmission_sig: h['paypal-transmission-sig'],
        transmission_time: h['paypal-transmission-time'],
        webhook_id: this.webhookId,
        webhook_event: payload,
      },
    );

    if (verifyRes?.verification_status !== 'SUCCESS') {
      throw new Error(
        `PayPal webhook signature verification failed: verification_status=${verifyRes?.verification_status ?? 'unknown'}`,
      );
    }

    const kind = this.mapEventKind(payload.event_type);
    if (kind === 'unknown') return null;

    const resource = payload.resource ?? {};
    return {
      kind,
      paymentId: resource.id ?? resource.supplementary_data?.related_ids?.order_id ?? '',
      orderReference: resource.custom_id ?? resource.invoice_id,
      amount: resource.amount?.value
        ? this.parseAmount(
            resource.amount.value,
            resource.amount.currency_code ?? 'USD',
          )
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
