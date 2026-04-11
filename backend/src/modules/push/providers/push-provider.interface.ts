/**
 * Common interface that every push-notification provider implements.
 *
 * Pick a provider by setting PUSH_PROVIDER in your .env to one of:
 *
 *   webpush    - W3C Web Push protocol with VAPID. Zero vendor
 *                account, works in every modern browser. The default
 *                and recommended starting point for web apps.
 *
 *   fcm        - Firebase Cloud Messaging. Supports Android, iOS, web.
 *                The `firebase-admin` package is an OPTIONAL dependency,
 *                lazy-loaded only when this provider is selected.
 *
 *   onesignal  - OneSignal (https://onesignal.com). Free up to 10k
 *                subscribers. Covers web + native via a single API.
 *
 *   expo       - Expo push service for React Native apps built with
 *                Expo. Pure REST, no SDK dep.
 *
 *   apns       - Apple Push Notification service (direct, no FCM).
 *                [PLANNED follow-up — not implemented in this PR]
 *
 *   none       - Push disabled. Every method throws loudly.
 *                The default if PUSH_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/push.md.
 */

export interface PushRecipient {
  /** Device token / subscription id. Shape is provider-dependent:
   *  - webpush: a JSON-stringified PushSubscription object
   *  - fcm: a registration token string
   *  - onesignal: a player id / subscription id
   *  - expo: an ExponentPushToken[xxxxxxxxxxxx] string
   *  - apns: an APNs device token string
   */
  token: string;
  /** Optional provider hint if the device table stores mixed tokens. */
  provider?: string;
}

export interface PushMessage {
  /** Short notification title. */
  title: string;
  /** Notification body text. */
  body: string;
  /** Optional deep link / web URL to open when tapped. */
  url?: string;
  /** Optional icon URL. */
  icon?: string;
  /** Badge count (iOS) or notification badge (Android). */
  badge?: number;
  /** Sound file name or "default". */
  sound?: string;
  /** Arbitrary key-value data delivered alongside the notification. */
  data?: Record<string, string | number | boolean | null>;
  /** Notification category / action group (iOS) or channel (Android). */
  category?: string;
  /** Tag for collapsing duplicate notifications (web + FCM). */
  tag?: string;
  /** TTL in seconds — providers that support it will drop undelivered
   * messages after this many seconds. */
  ttlSeconds?: number;
}

export interface PushResult {
  /** True if the provider accepted the message (delivery is separate). */
  accepted: boolean;
  /** Provider-specific message id for tracking. */
  messageId?: string;
  /** The provider that handled the send. */
  provider: string;
  /** If accepted=false, the reason from the provider. */
  error?: string;
}

export interface PushBulkResult {
  /** How many messages the provider accepted for delivery. */
  accepted: number;
  /** How many failed immediately (invalid token, unreachable, etc). */
  failed: number;
  /** Per-recipient results in the same order as the input. */
  results: PushResult[];
}

/**
 * Common interface implemented by every push provider. Methods a
 * provider can't support should throw PushProviderNotSupportedError —
 * never silently no-op.
 */
export interface PushProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'webpush'
    | 'fcm'
    | 'onesignal'
    | 'expo'
    | 'apns'
    | 'none';

  /** True if the provider has the credentials it needs. */
  isAvailable(): boolean;

  /**
   * Send a single push. Throws on unrecoverable config errors;
   * returns { accepted: false, error } for delivery rejections
   * (invalid token, unsubscribed, etc).
   */
  send(recipient: PushRecipient, message: PushMessage): Promise<PushResult>;

  /**
   * Send the same message to many recipients. Providers with native
   * multicast (FCM, OneSignal) use it; others loop send().
   */
  sendBulk(
    recipients: PushRecipient[],
    message: PushMessage,
  ): Promise<PushBulkResult>;

  /**
   * Frontend bootstrap — returns the public key(s) / app id / VAPID
   * key the browser needs to subscribe. Never includes secrets.
   */
  getPublicConfig(): {
    provider: string;
    /** VAPID public key for Web Push. */
    vapidPublicKey?: string;
    /** OneSignal app id for the frontend SDK. */
    oneSignalAppId?: string;
    /** FCM project sender id / web app config. */
    fcmConfig?: Record<string, string>;
    /** Any extra provider-specific config. */
    extra?: Record<string, any>;
  };
}

/**
 * Thrown when a provider is asked to do something it can't support.
 */
export class PushProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" push provider. See docs/providers/push.md.`,
    );
    this.name = 'PushProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class PushProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Push provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/push.md.`,
    );
    this.name = 'PushProviderNotConfiguredError';
  }
}
