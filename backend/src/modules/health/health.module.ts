import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ProvidersHealthService } from './providers-health.service';

@Module({
  controllers: [HealthController],
  providers: [ProvidersHealthService],
  exports: [ProvidersHealthService],
})
export class HealthModule {}
