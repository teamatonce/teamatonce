/**
 * Expo push provider — for React Native apps built with Expo.
 *
 *   PUSH_PROVIDER=expo
 *   EXPO_ACCESS_TOKEN=...        # optional; unauthenticated sends work
 *                                 # but are rate-limited
 *
 * Pure REST via fetch — no SDK dep. Expo's /v2/push/send endpoint
 * accepts batches of up to 100 messages per request.
 *
 * Recipient tokens are ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] strings.
 * Invalid tokens are reported per-message in the response rather
 * than failing the whole batch.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PushBulkResult,
  PushMessage,
  PushProvider,
  PushRecipient,
  PushResult,
} from './push-provider.interface';

const EXPO_API_URL = 'https://exp.host/--/api/v2/push/send';

export class ExpoProvider implements PushProvider {
  readonly name = 'expo' as const;
  private readonly logger = new Logger('ExpoProvider');

  private readonly accessToken: string;

  constructor(config: ConfigService) {
    this.accessToken = config.get<string>('EXPO_ACCESS_TOKEN', '');

    if (this.accessToken) {
      this.logger.log('Expo push provider configured (with access token)');
    } else {
      this.logger.log(
        'Expo push provider configured (unauthenticated — rate-limited)',
      );
    }
  }

  isAvailable(): boolean {
    // Expo push works without credentials (rate-limited), so always
    // available. Use EXPO_ACCESS_TOKEN for higher limits.
    return true;
  }

  private buildMessage(recipient: PushRecipient, message: PushMessage): any {
    return {
      to: recipient.token,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: message.sound ?? 'default',
      badge: message.badge,
      channelId: message.category,
      ttl: message.ttlSeconds,
      // Expo supports a `_displayInForeground` flag but that's
      // client-side behavior; omit.
    };
  }

  private async expoApi(messages: any[]): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const res = await fetch(EXPO_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `Expo push API failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async send(
    recipient: PushRecipient,
    message: PushMessage,
  ): Promise<PushResult> {
    try {
      const res = await this.expoApi([this.buildMessage(recipient, message)]);
      const ticket = res.data?.[0];
      if (ticket?.status === 'ok') {
        return {
          accepted: true,
          provider: 'expo',
          messageId: ticket.id,
        };
      }
      return {
        accepted: false,
        provider: 'expo',
        error: ticket?.message ?? 'unknown error',
      };
    } catch (e: any) {
      return {
        accepted: false,
        provider: 'expo',
        error: e.message ?? String(e),
      };
    }
  }

  async sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult> {
    // Expo recommends batches of up to 100.
    const results: PushResult[] = [];
    let accepted = 0;
    let failed = 0;

    const CHUNK = 100;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      const msgs = chunk.map((r) => this.buildMessage(r, message));
      try {
        const res = await this.expoApi(msgs);
        const tickets = res.data ?? [];
        for (let j = 0; j < chunk.length; j++) {
          const ticket = tickets[j];
          if (ticket?.status === 'ok') {
            results.push({
              accepted: true,
              provider: 'expo',
              messageId: ticket.id,
            });
            accepted++;
          } else {
            results.push({
              accepted: false,
              provider: 'expo',
              error: ticket?.message ?? 'unknown',
            });
            failed++;
          }
        }
      } catch (e: any) {
        for (const _ of chunk) {
          results.push({
            accepted: false,
            provider: 'expo',
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
      provider: 'expo',
      extra: {
        // Expo push tokens are obtained client-side via Expo SDK;
        // no config needed here.
      },
    };
  }
}
