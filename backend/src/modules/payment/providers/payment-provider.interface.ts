/**
 * Common interface that every payment provider implements.
 *
 * Pick a provider (or multiple) by setting PAYMENT_PROVIDER in your
 * .env to one of:
 *
 *   stripe         - Stripe (https://stripe.com). Global card processing
 *                    + Stripe Connect for marketplace vendor splits.
 *                    The production default.
 *
 *   paypal         - PayPal (https://paypal.com). Global alternative
 *                    with wide consumer reach.
 *
 *   bkash          - bKash (https://bkash.com). Bangladesh's largest
 *                    mobile money wallet. Required for any
 *                    Bangladesh-facing marketplace.
 *
 *   none           - Payments disabled. Every method throws.
 *                    The default if PAYMENT_PROVIDER is unset.
 *
 * Planned follow-ups (tracked in issue #18):
 *   razorpay, paystack, mollie, mpesa, square, adyen, lemonsqueezy,
 *   sslcommerz, nagad
 *
 * Why some planned providers aren't in this first-pass PR:
 *  - razorpay / paystack / mollie: each need a separate OAuth-like
 *    vendor-onboarding flow (Route / Subaccount / Connect) before
 *    marketplace splits work. Follow-up PRs per-region.
 *  - square / adyen: enterprise-scale with complex onboarding.
 *  - mpesa: Safaricom Daraja API needs a TLS client cert exchange
 *    that doesn't fit a pure-fetch adapter.
 *  - sslcommerz / nagad: Bangladesh-specific, similar surface to
 *    bkash but with different quirks — sensible to add after bkash
 *    is proven in production.
 *  - lemonsqueezy: digital-goods merchant-of-record, different
 *    refund/tax semantics that deserve their own module.
 *
 * Shipping 3 real providers in this PR is deliberate: they cover
 * the US/EU card path (stripe + paypal) AND the Bangladesh mobile
 * wallet path (bkash) which together handle ~80% of vasty-shop's
 * target audience. The rest land as follow-up PRs with their own
 * verification + marketplace-split logic.
 */

export interface PaymentAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string; // ISO 3166-1 alpha-2
  email?: string;
  phone?: string;
}

export interface CheckoutLineItem {
  /** Product id (stored as reference metadata — providers don't need
   * to resolve it). */
  productId: string;
  /** Human-readable description shown in the checkout UI. */
  description: string;
  /** Unit price in the **smallest currency unit** (cents/paisa/etc). */
  unitAmount: number;
  quantity: number;
  /** The vendor this line belongs to — needed for marketplace
   * splits. Multiple vendors in one order means the provider must
   * split the charge proportionally. */
  vendorAccountId?: string;
}

export interface CreateCheckoutInput {
  /** Business order id — used as the idempotency key / external ref. */
  orderReference: string;
  /** ISO 4217 currency code (uppercase). */
  currency: string;
  /** All line items in the cart. */
  lineItems: CheckoutLineItem[];
  /** Total amount in the smallest currency unit (sum of lineItems). */
  totalAmount: number;
  /** Platform fee taken by the marketplace (smallest currency unit). */
  platformFeeAmount?: number;
  /** Billing customer info. */
  customer: PaymentAddress;
  /** Where to send the customer after a successful payment. */
  successUrl: string;
  /** Where to send them if they cancel. */
  cancelUrl: string;
  /** Optional metadata — stored by the provider for webhook
   * correlation. */
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  /** Provider-specific session / order id. */
  sessionId: string;
  /** URL the frontend redirects the user to. */
  checkoutUrl: string;
  /** The provider name. */
  provider: string;
  /** Current status of the session at creation time. */
  status: PaymentStatus;
}

export type PaymentStatus =
  | 'pending' // session created, customer hasn't paid yet
  | 'processing' // customer submitted payment, provider hasn't confirmed
  | 'succeeded' // payment captured
  | 'failed' // payment rejected
  | 'refunded' // payment refunded (full or partial)
  | 'cancelled' // customer cancelled
  | 'expired' // session expired before payment
  | 'unknown';

export interface PaymentInfo {
  /** Provider-specific id. */
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** Order reference passed at creation. */
  orderReference: string;
  /** When the payment was captured (ISO 8601). */
  capturedAt?: string;
  /** Payment method used ("card", "mobile_wallet", "bank_transfer"). */
  method?: string;
  provider: string;
}

export interface RefundInput {
  /** The provider's payment id to refund against. */
  paymentId: string;
  /** Amount to refund (smallest currency unit). Omit for full refund. */
  amount?: number;
  /** Reason code for audit trail. */
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed';
  provider: string;
}

export interface WebhookEvent {
  /** Normalized event kind. */
  kind:
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.refunded'
    | 'payment.expired'
    | 'unknown';
  /** Provider-specific payment id. */
  paymentId: string;
  /** Business order reference if the provider carried it through. */
  orderReference?: string;
  /** Amount captured / refunded. */
  amount?: number;
  currency?: string;
  /** Raw payload for audit. */
  raw: any;
}

/**
 * Common interface implemented by every payment provider. Methods a
 * provider can't support should throw PaymentProviderNotSupportedError
 * — never silently no-op.
 */
export interface PaymentProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'stripe'
    | 'paypal'
    | 'bkash'
    | 'razorpay'
    | 'paystack'
    | 'mollie'
    | 'mpesa'
    | 'square'
    | 'adyen'
    | 'lemonsqueezy'
    | 'sslcommerz'
    | 'nagad'
    | 'none';

  /** True if the provider has the credentials it needs. */
  isAvailable(): boolean;

  /**
   * Create a hosted checkout session. Returns a URL the frontend
   * redirects the customer to.
   */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Look up the current status of a payment by the provider's
   * payment id.
   */
  getPayment(paymentId: string): Promise<PaymentInfo | null>;

  /**
   * Finalize a payment that requires a second confirm step after
   * the customer returns from hosted checkout (e.g. bKash's
   * /execute call after the redirect back with ?paymentID=...).
   * For providers whose hosted checkout auto-captures (Stripe,
   * PayPal), this is a pass-through that returns the current
   * payment status — so callers can always route through it
   * without branching on provider name.
   */
  capturePayment(paymentId: string): Promise<PaymentInfo>;

  /** Refund a previously-captured payment. */
  refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Verify and parse a webhook payload. Providers that sign their
   * webhooks (most of them) verify the signature first and throw
   * on mismatch.
   */
  parseWebhook(rawBody: string, signature?: string): Promise<WebhookEvent | null>;
}

/**
 * Thrown when a provider is asked to do something it can't support.
 */
export class PaymentProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" payment provider. See docs/providers/payments.md.`,
    );
    this.name = 'PaymentProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class PaymentProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Payment provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/payments.md.`,
    );
    this.name = 'PaymentProviderNotConfiguredError';
  }
}
