/**
 * "None" payment provider — payments disabled.
 *
 * The default if PAYMENT_PROVIDER is unset. Every method throws
 * PaymentProviderNotConfiguredError so checkout flows fail loudly
 * rather than silently creating phantom payments.
 */
import { Logger } from '@nestjs/common';
import {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentInfo,
  PaymentProvider,
  PaymentProviderNotConfiguredError,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface';

export class NonePaymentProvider implements PaymentProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NonePaymentProvider');

  constructor() {
    this.logger.log(
      'Payments are DISABLED (PAYMENT_PROVIDER not set). To enable, set PAYMENT_PROVIDER to one of: stripe, paypal, bkash. See docs/providers/payments.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new PaymentProviderNotConfiguredError('none', [
      `PAYMENT_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async createCheckout(_input: CreateCheckoutInput): Promise<CheckoutSession> {
    return this.fail('createCheckout');
  }
  async getPayment(_paymentId: string): Promise<PaymentInfo | null> {
    return null;
  }
  async capturePayment(_paymentId: string): Promise<PaymentInfo> {
    return this.fail('capturePayment');
  }
  async refund(_input: RefundInput): Promise<RefundResult> {
    return this.fail('refund');
  }
  async parseWebhook(
    _rawBody: string,
    _signature?: string,
  ): Promise<WebhookEvent | null> {
    return null;
  }
}
