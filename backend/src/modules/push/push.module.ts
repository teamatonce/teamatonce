import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';

/**
 * Push notification module — exposes the pluggable PushService for
 * all outbound push notifications.
 *
 * Pick a provider by setting PUSH_PROVIDER in your .env. See
 * `docs/providers/push.md`.
 */
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
