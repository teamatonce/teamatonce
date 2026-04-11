/**
 * PushService — the app's push notification façade.
 *
 * Modules that need to send push notifications (order updates,
 * flash-sale alerts, shipping notifications, promotional campaigns,
 * chat messages, etc.) should inject this service.
 *
 * Internally dispatches to whichever provider the operator has
 * selected via PUSH_PROVIDER in .env. See `./providers/` and
 * `docs/providers/push.md`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPushProvider,
  PushBulkResult,
  PushMessage,
  PushProvider,
  PushRecipient,
  PushResult,
} from './providers';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private provider!: PushProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createPushProvider(this.config);
    this.logger.log(
      `Push provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  async send(
    recipient: PushRecipient,
    message: PushMessage,
  ): Promise<PushResult> {
    return this.provider.send(recipient, message);
  }

  async sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult> {
    return this.provider.sendBulk(recipients, message);
  }

  /**
   * Frontend-safe bootstrap — returns only public keys. Used by the
   * `/config/push` endpoint so the web client can subscribe.
   */
  getPublicConfig() {
    return this.provider.getPublicConfig();
  }

  getProvider(): PushProvider {
    return this.provider;
  }
}
