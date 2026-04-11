/**
 * Payment provider factory.
 *
 * Reads PAYMENT_PROVIDER from config and returns the matching provider.
 *
 * Shipped in this PR:
 *   stripe   - Production default for cards + marketplace splits
 *   paypal   - Alternative with wide consumer reach
 *   bkash    - Bangladesh mobile wallet
 *   none     - Disabled (default if unset)
 *
 * Planned follow-ups (tracked in issue #18):
 *   razorpay, paystack, mollie, mpesa, square, adyen, lemonsqueezy,
 *   sslcommerz, nagad
 *
 * Unknown values fall back to 'none' — NOT to stripe. Payments are
 * a revenue-critical path where silent defaults would mask real
 * config bugs.
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PaymentProvider } from './payment-provider.interface';
import { StripeProvider } from './stripe.provider';
import { PayPalProvider } from './paypal.provider';
import { BkashProvider } from './bkash.provider';
import { NonePaymentProvider } from './none.provider';

const log = new Logger('PaymentProviderFactory');

export function createPaymentProvider(config: ConfigService): PaymentProvider {
  const choice = (config.get<string>('PAYMENT_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'stripe': {
      const p = new StripeProvider(config);
      log.log(
        `Selected payment provider: stripe (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'paypal': {
      const p = new PayPalProvider(config);
      log.log(
        `Selected payment provider: paypal (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'bkash': {
      const p = new BkashProvider(config);
      log.log(
        `Selected payment provider: bkash (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'razorpay':
    case 'paystack':
    case 'mollie':
    case 'mpesa':
    case 'square':
    case 'adyen':
    case 'lemonsqueezy':
    case 'sslcommerz':
    case 'nagad': {
      log.warn(
        `PAYMENT_PROVIDER="${choice}" is planned but not yet implemented (see issue #18). Falling back to "none". Implemented providers: stripe, paypal, bkash.`,
      );
      return new NonePaymentProvider();
    }
    case 'none':
    case '':
      return new NonePaymentProvider();
    default:
      log.warn(
        `Unknown PAYMENT_PROVIDER="${choice}". Falling back to "none". Valid values: stripe, paypal, bkash, none.`,
      );
      return new NonePaymentProvider();
  }
}

export * from './payment-provider.interface';
export { StripeProvider } from './stripe.provider';
export { PayPalProvider } from './paypal.provider';
export { BkashProvider } from './bkash.provider';
export { NonePaymentProvider } from './none.provider';
