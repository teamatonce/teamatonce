import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentModule } from '../payment/payment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamAtOnceWebSocketModule } from '../../websocket/websocket.module';
import { EscrowService } from './escrow.service';
import { DisputeService } from './dispute.service';
import { StripeConnectService } from './stripe-connect.service';
import { EscrowAutomationService } from './escrow-automation.service';
import { EscrowController, EscrowWebhookController } from './escrow.controller';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../invoicing/invoicing.module';

@Module({
  imports: [
    ConfigModule,
    PaymentModule, // Import PaymentModule to access StripeService
    forwardRef(() => NotificationsModule), // Import for notifications
    TeamAtOnceWebSocketModule, // Import WebSocket for real-time notifications
    ScheduleModule.forRoot(), // Enable cron jobs
    AuthModule,
    forwardRef(() => InvoicingModule), // Import for auto-invoice generation on escrow release
  ],
  providers: [
    EscrowService,
    DisputeService,
    StripeConnectService,
    EscrowAutomationService, // Refactored to use QueryBuilder pattern
  ],
  controllers: [EscrowController, EscrowWebhookController],
  exports: [EscrowService, DisputeService, StripeConnectService],
})
export class EscrowModule {}
