import { Module, forwardRef } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AuthModule } from '../../auth/auth.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [forwardRef(() => NotificationsModule), AuthModule, ReviewsModule],
  controllers: [DeveloperController],
  providers: [DeveloperService],
  exports: [DeveloperService],
})
export class DeveloperModule {}
