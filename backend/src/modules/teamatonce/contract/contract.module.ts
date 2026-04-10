import { Module, forwardRef } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { SupportService } from './support.service';
import { PaymentService } from './payment.service';
import { PaymentWebhookController } from './webhook.controller';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [forwardRef(() => NotificationsModule), AuthModule],
  controllers: [ContractController, PaymentWebhookController],
  providers: [ContractService, SupportService, PaymentService],
  exports: [ContractService, SupportService, PaymentService],
})
export class ContractModule {}
