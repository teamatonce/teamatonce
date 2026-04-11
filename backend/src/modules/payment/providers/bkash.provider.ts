/**
 * bKash payment provider — Bangladesh mobile wallet.
 *
 *   PAYMENT_PROVIDER=bkash
 *   BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta   (sandbox)
 *   # BKASH_BASE_URL=https://tokenized.pay.bka.sh/v1.2.0-beta    (production)
 *   BKASH_APP_KEY=...
 *   BKASH_APP_SECRET=...
 *   BKASH_USERNAME=...
 *   BKASH_PASSWORD=...
 *
 * bKash is Bangladesh's largest mobile money platform — a must-have
 * for any Bangladesh-origin marketplace. Uses the Tokenized Checkout
 * API: create payment → customer enters PIN on bKash's hosted page
 * → callback to merchant → execute payment → confirmation.
 *
 * Auth: 2-legged token exchange using the tokenized checkout
 * /token/grant endpoint with username + password HEADERS (yes,
 * as plain headers — not basic auth). The returned `id_token` is
 * used as the `Authorization` header on subsequent calls, plus
 * the `x-app-key` header for every request.
 *
 * Workflow:
 *   createCheckout → POST /checkout/create
 *      returns { paymentID, bkashURL } — customer redirects to bkashURL
 *   (customer enters PIN on bKash page, returns to merchant
 *    success_url with a ?status=success&paymentID=... query string)
 *   merchant calls /checkout/execute to actually capture
 *   getPayment → GET /checkout/payment/status
 *   refund → POST /checkout/payment/refund
 *
 * THIS IS A FIRST-PASS INTEGRATION. Real-world bKash integrations
 * often need the `intent=sale` vs `intent=authorization` distinction,
 * custom merchant invoice number formats, and specific URL-encoding
 * quirks that vary between sandbox and production. Smoke-tested
 * with mocked fetch; production deployments should validate against
 * real sandbox before going live.
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

export class BkashProvider implements PaymentProvider {
  readonly name = 'bkash' as const;
  private readonly logger = new Logger('BkashProvider');

  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly username: string;
  private readonly password: string;

  private idToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>(
        'BKASH_BASE_URL',
        'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
      ) || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
    ).replace(/\/+$/, '');
    this.appKey = config.get<string>('BKASH_APP_KEY', '');
    this.appSecret = config.get<string>('BKASH_APP_SECRET', '');
    this.username = config.get<string>('BKASH_USERNAME', '');
    this.password = config.get<string>('BKASH_PASSWORD', '');

    if (this.isAvailable()) {
      this.logger.log(`bKash provider configured (${this.baseUrl})`);
    } else {
      this.logger.warn(
        'bKash provider selected but BKASH_APP_KEY / APP_SECRET / USERNAME / PASSWORD missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(
      this.appKey &&
      this.appSecret &&
      this.username &&
      this.password
    );
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.appKey) out.push('BKASH_APP_KEY');
    if (!this.appSecret) out.push('BKASH_APP_SECRET');
    if (!this.username) out.push('BKASH_USERNAME');
    if (!this.password) out.push('BKASH_PASSWORD');
    return out;
  }

  private async ensureToken(): Promise<string> {
    if (this.idToken && Date.now() < this.tokenExpiresAt) {
      return this.idToken;
    }
    if (!this.isAvailable()) {
      throw new PaymentProviderNotConfiguredError('bkash', this.missingVars());
    }

    const res = await fetch(
      `${this.baseUrl}/tokenized/checkout/token/grant`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // bKash uses raw username + password HEADERS (not basic auth)
          username: this.username,
          password: this.password,
        },
        body: JSON.stringify({
          app_key: this.appKey,
          app_secret: this.appSecret,
        }),
      },
    );

    const json = (await res.json()) as {
      id_token?: string;
      expires_in?: number;
      statusCode?: string;
      statusMessage?: string;
    };
    if (!res.ok || !json.id_token) {
      throw new Error(
        `bKash token grant failed: ${res.status} ${json.statusMessage ?? JSON.stringify(json)}`,
      );
    }

    this.idToken = json.id_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (json.expires_in ?? 3600) - 60) * 1000;
    return this.idToken;
  }

  private async bkashApi(path: string, body: any): Promise<any> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: token,
        'x-app-key': this.appKey,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok || (json.statusCode && json.statusCode !== '0000')) {
      throw new Error(
        `bKash API ${path} failed: ${res.status} ${json.statusMessage ?? JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // bKash amounts are decimal strings in BDT (not paisa).
    const amountBdt = (input.totalAmount / 100).toFixed(2);

    const res = await this.bkashApi('/tokenized/checkout/create', {
      mode: '0011', // 0011 = checkout (tokenized)
      payerReference: input.customer.phone ?? input.orderReference,
      callbackURL: input.successUrl,
      amount: amountBdt,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: input.orderReference,
    });

    return {
      sessionId: res.paymentID,
      checkoutUrl: res.bkashURL,
      provider: 'bkash',
      status: 'pending',
    };
  }

  /**
   * Execute a previously-created payment. Called after bKash
   * redirects the customer back to the callback URL with
   * ?paymentID=... — the controller handling that redirect should
   * call this to actually capture the payment.
   */
  async executePayment(paymentId: string): Promise<PaymentInfo> {
    const res = await this.bkashApi('/tokenized/checkout/execute', {
      paymentID: paymentId,
    });
    return {
      paymentId: res.paymentID ?? paymentId,
      status: res.transactionStatus === 'Completed' ? 'succeeded' : 'pending',
      amount: Math.round(parseFloat(res.amount ?? '0') * 100),
      currency: 'BDT',
      orderReference: res.merchantInvoiceNumber ?? '',
      capturedAt: res.paymentExecuteTime,
      method: 'mobile_wallet',
      provider: 'bkash',
    };
  }

  async getPayment(paymentId: string): Promise<PaymentInfo | null> {
    try {
      const res = await this.bkashApi('/tokenized/checkout/payment/status', {
        paymentID: paymentId,
      });
      return {
        paymentId: res.paymentID ?? paymentId,
        status: this.mapStatus(res.transactionStatus),
        amount: Math.round(parseFloat(res.amount ?? '0') * 100),
        currency: 'BDT',
        orderReference: res.merchantInvoiceNumber ?? '',
        capturedAt: res.paymentExecuteTime,
        method: 'mobile_wallet',
        provider: 'bkash',
      };
    } catch (e: any) {
      if (/2007|payment not found/i.test(e.message)) return null;
      throw e;
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // bKash refund needs the trxID, which the provider returns
    // from execute/status. For a first pass, we accept the
    // payment_id (sessionId) AS the trxID — real integrations
    // should store the trxID separately.
    const res = await this.bkashApi('/tokenized/checkout/payment/refund', {
      paymentID: input.paymentId,
      amount: input.amount !== undefined
        ? (input.amount / 100).toFixed(2)
        : undefined,
      trxID: input.paymentId,
      sku: 'refund',
      reason: input.reason ?? 'Customer refund',
    });
    return {
      refundId: res.refundTrxID ?? `bkash-refund-${Date.now()}`,
      amount: Math.round(parseFloat(res.amount ?? '0') * 100),
      status: res.transactionStatus === 'Completed' ? 'succeeded' : 'pending',
      provider: 'bkash',
    };
  }

  async parseWebhook(
    rawBody: string,
    _signature?: string,
  ): Promise<WebhookEvent | null> {
    // bKash doesn't have standard push webhooks like Stripe. Their
    // integration pattern is poll-based: the merchant's callback
    // URL receives a ?paymentID query param, then the merchant
    // calls /execute and /status. This method is kept for
    // interface parity — returns null for any body that doesn't
    // look like a recognizable bKash notification.
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!payload?.paymentID) return null;
    return {
      kind:
        payload.transactionStatus === 'Completed'
          ? 'payment.succeeded'
          : 'unknown',
      paymentId: payload.paymentID,
      orderReference: payload.merchantInvoiceNumber,
      amount: payload.amount
        ? Math.round(parseFloat(payload.amount) * 100)
        : undefined,
      currency: 'BDT',
      raw: payload,
    };
  }

  private mapStatus(raw?: string): PaymentStatus {
    switch ((raw ?? '').toLowerCase()) {
      case 'initiated':
      case 'created':
        return 'pending';
      case 'inprogress':
        return 'processing';
      case 'completed':
      case 'success':
        return 'succeeded';
      case 'failed':
      case 'cancelled':
        return 'failed';
      default:
        return 'unknown';
    }
  }
}
