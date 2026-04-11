/**
 * Web Push provider — W3C Web Push protocol with VAPID.
 *
 *   PUSH_PROVIDER=webpush
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:admin@yourdomain.com
 *
 * Zero vendor account required — Web Push is a browser standard.
 * Uses the `web-push` npm package (OPTIONAL dependency, lazy-loaded
 * inside loadSdk()) for VAPID key signing and payload encryption.
 *
 * Generate VAPID keys once:
 *   npx web-push generate-vapid-keys
 *
 * The public key goes to the frontend via `getPublicConfig()` so the
 * browser can subscribe; the private key stays in .env and is used
 * to sign outbound push requests.
 *
 * Recipient tokens are JSON-stringified browser PushSubscription
 * objects of the form:
 *   { "endpoint": "https://fcm.googleapis.com/fcm/send/...",
 *     "keys": { "p256dh": "...", "auth": "..." } }
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

export class WebPushProvider implements PushProvider {
  readonly name = 'webpush' as const;
  private readonly logger = new Logger('WebPushProvider');

  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly subject: string;

  private sdkLoaded = false;
  private webpush: any;

  constructor(config: ConfigService) {
    this.publicKey = config.get<string>('VAPID_PUBLIC_KEY', '');
    this.privateKey = config.get<string>('VAPID_PRIVATE_KEY', '');
    this.subject = config.get<string>(
      'VAPID_SUBJECT',
      'mailto:admin@example.com',
    );

    if (this.isAvailable()) {
      this.logger.log('Web Push provider configured (VAPID)');
    } else {
      this.logger.warn(
        'Web Push provider selected but VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing. Generate keys with: npx web-push generate-vapid-keys',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.publicKey && this.privateKey);
  }

  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new PushProviderNotConfiguredError('webpush', [
        !this.publicKey ? 'VAPID_PUBLIC_KEY' : '',
        !this.privateKey ? 'VAPID_PRIVATE_KEY' : '',
      ].filter(Boolean));
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.webpush = require('web-push');
      this.webpush.setVapidDetails(
        this.subject,
        this.publicKey,
        this.privateKey,
      );
      this.sdkLoaded = true;
      this.logger.log('web-push package loaded');
    } catch (e: any) {
      throw new Error(
        `Web Push provider selected but the "web-push" package is not installed. ` +
          `Run: npm install web-push    Original: ${e.message}`,
      );
    }
  }

  private parseSubscription(token: string): any {
    try {
      return JSON.parse(token);
    } catch {
      throw new Error(
        `Invalid Web Push token — expected a JSON-stringified PushSubscription, got: ${token.slice(0, 60)}...`,
      );
    }
  }

  async send(
    recipient: PushRecipient,
    message: PushMessage,
  ): Promise<PushResult> {
    this.loadSdk();

    // Keep parse + send under the same try/catch so malformed tokens
    // surface as `{ accepted: false, error: ... }` instead of throwing
    // — the caller shouldn't have to wrap every send in try/catch.
    try {
      const subscription = this.parseSubscription(recipient.token);
      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url,
        icon: message.icon,
        badge: message.badge,
        tag: message.tag,
        data: message.data,
      });

      const res = await this.webpush.sendNotification(subscription, payload, {
        TTL: message.ttlSeconds ?? 86400,
      });
      return {
        accepted: true,
        provider: 'webpush',
        messageId: res.headers?.['message-id'] ?? `webpush-${Date.now()}`,
      };
    } catch (e: any) {
      // 404/410 = subscription expired; malformed token = caller bug;
      // caller should remove the token from the device table either way.
      return {
        accepted: false,
        provider: 'webpush',
        error: e.message ?? String(e),
      };
    }
  }

  async sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult> {
    const results: PushResult[] = [];
    let accepted = 0;
    let failed = 0;

    // Web Push has no multicast — loop send() in parallel.
    const settled = await Promise.all(
      recipients.map((r) =>
        this.send(r, message).catch((e) => ({
          accepted: false as const,
          provider: 'webpush',
          error: e.message ?? String(e),
        })),
      ),
    );

    for (const r of settled) {
      results.push(r);
      if (r.accepted) accepted++;
      else failed++;
    }

    return { accepted, failed, results };
  }

  getPublicConfig() {
    return {
      provider: 'webpush',
      vapidPublicKey: this.publicKey,
    };
  }
}
