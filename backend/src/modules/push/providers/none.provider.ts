/**
 * "None" push provider — push notifications disabled.
 *
 * The default if PUSH_PROVIDER is unset. Every method throws
 * PushProviderNotConfiguredError so calling code fails loudly rather
 * than silently swallowing outbound notifications.
 */
import { Logger } from '@nestjs/common';
import {
  PushBulkResult,
  PushMessage,
  PushProvider,
  PushProviderNotConfiguredError,
  PushRecipient,
  PushResult,
} from './push-provider.interface';

export class NonePushProvider implements PushProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NonePushProvider');

  constructor() {
    this.logger.log(
      'Push is DISABLED (PUSH_PROVIDER not set). To enable, set PUSH_PROVIDER to one of: webpush, fcm, onesignal, expo. See docs/providers/push.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new PushProviderNotConfiguredError('none', [
      `PUSH_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async send(
    _recipient: PushRecipient,
    _message: PushMessage,
  ): Promise<PushResult> {
    return this.fail('send');
  }

  async sendBulk(
    _recipients: PushRecipient[],
    _message: PushMessage,
  ): Promise<PushBulkResult> {
    return this.fail('sendBulk');
  }

  getPublicConfig() {
    return {
      provider: 'none',
      extra: { disabled: true },
    };
  }
}
