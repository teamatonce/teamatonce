/**
 * Firebase Cloud Messaging provider.
 *
 *   PUSH_PROVIDER=fcm
 *   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   # full JSON string
 *   # OR
 *   FIREBASE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
 *   FCM_PROJECT_ID=your-project-id    # optional; extracted from service account
 *
 * Uses the HTTP v1 API (/v1/projects/{pid}/messages:send) with an
 * access token minted from the service account via `firebase-admin`.
 * `firebase-admin` is an OPTIONAL dependency, lazy-loaded inside
 * loadSdk() only when this provider is selected.
 *
 * FCM covers Android, iOS (via APNs-behind-FCM), and web. For web,
 * the frontend needs a Firebase web config — pass it via
 * `getPublicConfig()` or inject from your own config endpoint.
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

export class FcmProvider implements PushProvider {
  readonly name = 'fcm' as const;
  private readonly logger = new Logger('FcmProvider');

  private readonly serviceAccountJson: string;
  private readonly serviceAccountFile: string;
  private readonly projectId: string;
  private readonly webConfigJson: string;

  private sdkLoaded = false;
  private admin: any;
  private app: any;

  constructor(config: ConfigService) {
    this.serviceAccountJson = config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT',
      '',
    );
    this.serviceAccountFile = config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_FILE',
      '',
    );
    this.projectId = config.get<string>('FCM_PROJECT_ID', '');
    this.webConfigJson = config.get<string>('FIREBASE_WEB_CONFIG', '');

    if (this.isAvailable()) {
      this.logger.log('FCM provider configured');
    } else {
      this.logger.warn(
        'FCM provider selected but FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_FILE missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.serviceAccountJson || this.serviceAccountFile);
  }

  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new PushProviderNotConfiguredError('fcm', [
        'FIREBASE_SERVICE_ACCOUNT',
      ]);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.admin = require('firebase-admin');

      // Parse the service account config.
      let credential: any;
      if (this.serviceAccountJson) {
        const parsed = JSON.parse(this.serviceAccountJson);
        credential = this.admin.credential.cert(parsed);
      } else {
        credential = this.admin.credential.cert(this.serviceAccountFile);
      }

      // Reuse an existing default app if something else already
      // initialized firebase-admin (e.g. another module).
      const existing = this.admin.apps.find(
        (a: any) => a?.name === '[DEFAULT]',
      );
      this.app = existing ?? this.admin.initializeApp({ credential });
      this.sdkLoaded = true;
      this.logger.log('firebase-admin loaded');
    } catch (e: any) {
      throw new Error(
        `FCM provider selected but the "firebase-admin" package is not installed. ` +
          `Run: npm install firebase-admin    Original: ${e.message}`,
      );
    }
  }

  private buildMessage(recipient: PushRecipient, message: PushMessage): any {
    // Convert all data values to strings — FCM data payload requires
    // string values only.
    const stringData: Record<string, string> = {};
    if (message.data) {
      for (const [k, v] of Object.entries(message.data)) {
        if (v !== null && v !== undefined) stringData[k] = String(v);
      }
    }
    if (message.url) stringData.url = message.url;

    return {
      token: recipient.token,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: stringData,
      android: {
        notification: {
          icon: message.icon,
          tag: message.tag,
          sound: message.sound ?? 'default',
          channelId: message.category,
        },
        ttl: (message.ttlSeconds ?? 86400) * 1000, // ms
      },
      apns: {
        payload: {
          aps: {
            badge: message.badge,
            sound: message.sound ?? 'default',
            category: message.category,
          },
        },
      },
      webpush: {
        notification: {
          icon: message.icon,
          badge: message.badge,
          tag: message.tag,
        },
        fcmOptions: message.url ? { link: message.url } : undefined,
      },
    };
  }

  async send(
    recipient: PushRecipient,
    message: PushMessage,
  ): Promise<PushResult> {
    this.loadSdk();
    try {
      const messageId = await this.admin
        .messaging(this.app)
        .send(this.buildMessage(recipient, message));
      return {
        accepted: true,
        provider: 'fcm',
        messageId,
      };
    } catch (e: any) {
      return {
        accepted: false,
        provider: 'fcm',
        error: e.message ?? String(e),
      };
    }
  }

  async sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult> {
    this.loadSdk();

    // FCM's sendEach supports up to 500 messages per batch. For
    // larger fan-outs, chunk. (sendAll was removed in firebase-admin
    // v12 — sendEach is the replacement with the same BatchResponse
    // shape.)
    const results: PushResult[] = [];
    let accepted = 0;
    let failed = 0;

    const CHUNK = 500;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      const msgs = chunk.map((r) => this.buildMessage(r, message));
      try {
        const response = await this.admin
          .messaging(this.app)
          .sendEach(msgs);
        for (let j = 0; j < response.responses.length; j++) {
          const r = response.responses[j];
          if (r.success) {
            results.push({
              accepted: true,
              provider: 'fcm',
              messageId: r.messageId,
            });
            accepted++;
          } else {
            results.push({
              accepted: false,
              provider: 'fcm',
              error: r.error?.message ?? 'unknown',
            });
            failed++;
          }
        }
      } catch (e: any) {
        // Whole-chunk failure: mark each as failed.
        for (const _r of chunk) {
          results.push({
            accepted: false,
            provider: 'fcm',
            error: e.message ?? 'batch send failed',
          });
          failed++;
        }
      }
    }

    return { accepted, failed, results };
  }

  getPublicConfig() {
    let fcmConfig: Record<string, string> | undefined;
    if (this.webConfigJson) {
      try {
        fcmConfig = JSON.parse(this.webConfigJson);
      } catch {
        /* ignore malformed JSON */
      }
    }
    return {
      provider: 'fcm',
      fcmConfig,
    };
  }
}
