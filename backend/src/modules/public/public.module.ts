import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { ReviewsModule } from '../teamatonce/reviews/reviews.module';

@Module({
  imports: [ReviewsModule],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
