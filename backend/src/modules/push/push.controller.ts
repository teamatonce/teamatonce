import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PushService } from './push.service';

/**
 * Public push bootstrap endpoint.
 *
 *   GET /api/v1/config/push
 *
 * Returns the public VAPID key / OneSignal app id / FCM web config
 * the frontend needs to subscribe to push notifications. Never
 * includes secrets.
 *
 * Deliberately unauthenticated — it's consumed on every page load
 * by the PWA service worker registration.
 */
@ApiTags('push')
@Controller('config')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('push')
  @ApiOperation({ summary: 'Frontend push notifications bootstrap' })
  getConfig() {
    return this.push.getPublicConfig();
  }
}
