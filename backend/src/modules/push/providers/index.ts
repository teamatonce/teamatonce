/**
 * Push provider factory.
 *
 * Reads PUSH_PROVIDER from config and returns the matching provider.
 *
 * Shipped in this PR:
 *   webpush    — W3C Web Push + VAPID (recommended for web-only)
 *   fcm        — Firebase Cloud Messaging (android + ios + web)
 *   onesignal  — OneSignal (cross-platform, generous free tier)
 *   expo       — Expo push service (React Native / Expo apps)
 *   none       — disabled
 *
 * Planned follow-ups (tracked in issue #21):
 *   apns       — direct Apple Push Notification service
 *                (needs HTTP/2 client — skipped in v1; use FCM for iOS
 *                in the meantime, which delivers via APNs under the hood)
 *
 * Selecting a planned value logs a warning and falls back to 'none'.
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PushProvider } from './push-provider.interface';
import { WebPushProvider } from './webpush.provider';
import { FcmProvider } from './fcm.provider';
import { OneSignalProvider } from './onesignal.provider';
import { ExpoProvider } from './expo.provider';
import { NonePushProvider } from './none.provider';

const log = new Logger('PushProviderFactory');

export function createPushProvider(config: ConfigService): PushProvider {
  const choice = (config.get<string>('PUSH_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'webpush':
    case 'web-push':
    case 'web': {
      const p = new WebPushProvider(config);
      log.log(`Selected push provider: webpush (available=${p.isAvailable()})`);
      return p;
    }
    case 'fcm':
    case 'firebase': {
      const p = new FcmProvider(config);
      log.log(`Selected push provider: fcm (available=${p.isAvailable()})`);
      return p;
    }
    case 'onesignal':
    case 'one-signal': {
      const p = new OneSignalProvider(config);
      log.log(
        `Selected push provider: onesignal (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'expo': {
      const p = new ExpoProvider(config);
      log.log(`Selected push provider: expo (available=${p.isAvailable()})`);
      return p;
    }
    case 'apns': {
      log.warn(
        'PUSH_PROVIDER="apns" is planned but not yet implemented (see issue #21). Falling back to "none". For iOS push today, use fcm (delivers via APNs under the hood).',
      );
      return new NonePushProvider();
    }
    case 'none':
    case '':
      return new NonePushProvider();
    default:
      log.warn(
        `Unknown PUSH_PROVIDER="${choice}". Falling back to "none". Valid values: webpush, fcm, onesignal, expo, none.`,
      );
      return new NonePushProvider();
  }
}

export * from './push-provider.interface';
export { WebPushProvider } from './webpush.provider';
export { FcmProvider } from './fcm.provider';
export { OneSignalProvider } from './onesignal.provider';
export { ExpoProvider } from './expo.provider';
export { NonePushProvider } from './none.provider';
