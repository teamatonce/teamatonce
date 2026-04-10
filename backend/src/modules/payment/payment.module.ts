import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { TeamAtOncePaymentController } from './teamatonce-payment.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Payment Module
 *
 * Provides Stripe payment integration for Team@Once platform
 * Handles subscriptions, payment methods, invoices, and checkout sessions
 *
 * Includes two controllers:
 * - PaymentController: Original /payment/* endpoints
 * - Team@OncePaymentController: Wrapper /teamatonce/* endpoints for frontend compatibility
 */
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [StripeService, PaymentService],
  controllers: [PaymentController, TeamAtOncePaymentController],
  exports: [StripeService, PaymentService],
})
export class PaymentModule {}
