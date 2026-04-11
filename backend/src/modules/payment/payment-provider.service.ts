/**
 * PaymentProviderService — pluggable payment façade.
 *
 * New code should inject this service instead of calling the
 * legacy `PaymentService` (which is hardcoded to Stripe) directly.
 * Switching providers is a matter of changing `PAYMENT_PROVIDER`
 * in .env.
 *
 * The existing `PaymentService` and `StripeConnectService` still
 * exist for backwards compatibility. A follow-up PR will migrate
 * their internals to delegate to this façade and delete the
 * hardcoded Stripe paths.
 *
 * See `./providers/` and `docs/providers/payments.md`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPaymentProvider,
  CheckoutSession,
  CreateCheckoutInput,
  PaymentInfo,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './providers';

@Injectable()
export class PaymentProviderService implements OnModuleInit {
  private readonly logger = new Logger(PaymentProviderService.name);
  private provider!: PaymentProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createPaymentProvider(this.config);
    this.logger.log(
      `Payment provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    return this.provider.createCheckout(input);
  }

  async getPayment(paymentId: string): Promise<PaymentInfo | null> {
    return this.provider.getPayment(paymentId);
  }

  async capturePayment(paymentId: string): Promise<PaymentInfo> {
    return this.provider.capturePayment(paymentId);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return this.provider.refund(input);
  }

  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<WebhookEvent | null> {
    return this.provider.parseWebhook(rawBody, signature);
  }

  getProvider(): PaymentProvider {
    return this.provider;
  }
}
