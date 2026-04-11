import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { TeamAtOncePaymentController } from './teamatonce-payment.controller';
import { PaymentProviderService } from './payment-provider.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Payment Module
 *
 * Exposes three services:
 *
 * - `PaymentProviderService` (NEW, pluggable)
 *   The façade over the multi-provider adapter (stripe / paypal /
 *   bkash / none). Switch providers with `PAYMENT_PROVIDER` in .env.
 *   New code should inject this. See `docs/providers/payments.md`.
 *
 * - `StripeService` (legacy)
 *   Subscriptions + invoices + checkout sessions hardcoded to Stripe.
 *   Still exported for backwards compatibility.
 *
 * - `PaymentService` (legacy)
 *   High-level Team@Once payment flows. Still Stripe-only.
 *
 * Two controllers:
 *   - `PaymentController`: original /payment/* endpoints
 *   - `Team@OncePaymentController`: wrapper /teamatonce/* endpoints
 */
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [StripeService, PaymentService, PaymentProviderService],
  controllers: [PaymentController, TeamAtOncePaymentController],
  exports: [StripeService, PaymentService, PaymentProviderService],
})
export class PaymentModule {}
