/**
 * OneSignal push provider.
 *
 *   PUSH_PROVIDER=onesignal
 *   ONESIGNAL_APP_ID=...
 *   ONESIGNAL_API_KEY=...        # REST API key (NOT the User Auth key)
 *
 * Pure REST via fetch — no SDK dep needed. Sign up at
 * https://onesignal.com, create an app, copy the App ID and REST API
 * key from Keys & IDs.
 *
 * Free tier: unlimited subscribers on the free plan (as of the last
 * time I checked); paid plans unlock advanced segmentation and
 * analytics.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PushBulkResult,
  PushMessage,
  PushProvider,
  PushProviderNotConfiguredError,
  PushRecipient,
  PushResult,
} from './push-provider.interface';

const ONESIGNAL_API_BASE = 'https://onesignal.com/api/v1';

export class OneSignalProvider implements PushProvider {
  readonly name = 'onesignal' as const;
  private readonly logger = new Logger('OneSignalProvider');

  private readonly appId: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('ONESIGNAL_APP_ID', '');
    this.apiKey = config.get<string>('ONESIGNAL_API_KEY', '');

    if (this.isAvailable()) {
      this.logger.log('OneSignal provider configured');
    } else {
      this.logger.warn(
        'OneSignal provider selected but ONESIGNAL_APP_ID / ONESIGNAL_API_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.appId && this.apiKey);
  }

  private async oneSignalApi(
    method: 'POST',
    path: string,
    body: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new PushProviderNotConfiguredError('onesignal', [
        !this.appId ? 'ONESIGNAL_APP_ID' : '',
        !this.apiKey ? 'ONESIGNAL_API_KEY' : '',
      ].filter(Boolean));
    }
    const res = await fetch(`${ONESIGNAL_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `OneSignal API ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  private buildPayload(
    recipients: PushRecipient[],
    message: PushMessage,
  ): any {
    // OneSignal supports addressing by "player id" (their term for a
    // subscription id) via include_player_ids or include_subscription_ids.
    // We use include_player_ids since that's backwards-compatible.
    return {
      app_id: this.appId,
      include_player_ids: recipients.map((r) => r.token),
      headings: { en: message.title },
      contents: { en: message.body },
      url: message.url,
      large_icon: message.icon,
      ios_badgeCount: message.badge,
      ios_badgeType: message.badge !== undefined ? 'SetTo' : undefined,
      ios_sound: message.sound,
      android_channel_id: message.category,
      data: message.data,
      collapse_id: message.tag,
      ttl: message.ttlSeconds,
    };
  }

  async send(
    recipient: PushRecipient,
    message: PushMessage,
  ): Promise<PushResult> {
    try {
      const res = await this.oneSignalApi('POST', '/notifications', {
        ...this.buildPayload([recipient], message),
      });
      return {
        accepted: true,
        provider: 'onesignal',
        messageId: res.id,
      };
    } catch (e: any) {
      return {
        accepted: false,
        provider: 'onesignal',
        error: e.message,
      };
    }
  }

  async sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult> {
    // OneSignal accepts up to 2000 player ids per request via
    // include_player_ids. Chunk if needed.
    const results: PushResult[] = [];
    let accepted = 0;
    let failed = 0;

    const CHUNK = 2000;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      try {
        const res = await this.oneSignalApi(
          'POST',
          '/notifications',
          this.buildPayload(chunk, message),
        );
        // OneSignal reports one message id per batch, not per
        // recipient. Synthesize per-recipient results.
        for (const _ of chunk) {
          results.push({
            accepted: true,
            provider: 'onesignal',
            messageId: res.id,
          });
          accepted++;
        }
      } catch (e: any) {
        for (const _ of chunk) {
          results.push({
            accepted: false,
            provider: 'onesignal',
            error: e.message,
          });
          failed++;
        }
      }
    }

    return { accepted, failed, results };
  }

  getPublicConfig() {
    return {
      provider: 'onesignal',
      oneSignalAppId: this.appId,
    };
  }
}
