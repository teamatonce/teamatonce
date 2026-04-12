import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Referral Program Module
 *
 * Provides referral code generation, click tracking, signup tracking,
 * conversion tracking, and referral stats dashboard.
 *
 * Closes: GitHub issue #56
 */
@Module({
  imports: [ConfigModule, AuthModule],
  providers: [ReferralService],
  controllers: [ReferralController],
  exports: [ReferralService],
})
export class ReferralModule {}
