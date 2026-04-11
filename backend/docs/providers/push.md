# Push notification providers

Vasty Shop supports four push backends plus a `none` default for
delivering order updates, flash-sale alerts, shipping notifications,
chat messages, and promotional campaigns.

```
PUSH_PROVIDER=webpush   # zero-vendor default
```

## Comparison

| Provider | Platforms | Cost | Infra | Server dep | Best for |
|---|---|---|---|---|---|
| **webpush** *(recommended for web)* | web | free | none | `web-push` *(optional)* | PWAs, web-only apps |
| **fcm** | android + ios + web | free | Firebase account | `firebase-admin` *(optional)* | cross-platform coverage |
| **onesignal** | web + android + ios | free up to 10k subs | none | none (REST) | easiest managed option |
| **expo** | iOS + Android (React Native) | free | none | none (REST) | Expo-built mobile apps |
| **apns** | iOS (direct) | — | — | — | [planned #21] |
| **none** *(default if unset)* | — | — | — | — | push features disabled |

## Which should I pick?

- **"I have a web app and want browser notifications"** → `webpush` (no vendor account, works in every modern browser)
- **Cross-platform: web + Android + iOS app** → `fcm` (FCM delivers to iOS via APNs under the hood, so it's the cheapest path to all three)
- **"I just want one dashboard for everything"** → `onesignal`
- **React Native / Expo mobile app** → `expo`
- **Not using push yet** → leave `PUSH_PROVIDER` unset; the web client should check `/config/push` and hide notification UI when provider is `none`

## Per-provider setup

### webpush (W3C Web Push + VAPID)

Zero vendor account. Works in Chrome, Firefox, Safari 16+, Edge, and
every other modern browser that implements the W3C Push API.

```bash
# One-time: generate a VAPID key pair
npx web-push generate-vapid-keys
```

```
PUSH_PROVIDER=webpush
VAPID_PUBLIC_KEY=BJ...           # base64url public key
VAPID_PRIVATE_KEY=xJ...          # base64url private key — KEEP SECRET
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

The `web-push` package is in **optionalDependencies** — it's lazy-loaded on first use. If you pick a different provider, it's never installed.

**Frontend flow**:
1. Client fetches `/api/v1/config/push` → gets `vapidPublicKey`
2. Registers a service worker that calls `ServiceWorkerRegistration.pushManager.subscribe({ applicationServerKey: vapidPublicKey, userVisibleOnly: true })`
3. Sends the resulting `PushSubscription` JSON to the backend via a device-token registration endpoint
4. Backend stores the JSON as the device's token; when pushing, it JSON-parses the token and passes to `web-push.sendNotification()`

**Recipient tokens are JSON-stringified `PushSubscription` objects** (not opaque strings). The provider parses them on every send.

### fcm (Firebase Cloud Messaging)

Sign up at <https://console.firebase.google.com>, create a project, go to Project Settings → Service Accounts, and generate a new private key. You can either paste the whole JSON into an env var or point at a file.

```
PUSH_PROVIDER=fcm
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}
# OR
FIREBASE_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase.json

# Optional: for the web SDK bootstrap on the frontend
FIREBASE_WEB_CONFIG={"apiKey":"...","projectId":"...","messagingSenderId":"...","appId":"..."}
```

The `firebase-admin` package is in **optionalDependencies** — lazy-loaded on first use. If you pick a different provider, you don't install it (save ~50MB).

**Batch sending**: `sendBulk` uses FCM's `sendAll` API which accepts up to 500 messages per request. The provider automatically chunks larger fan-outs.

**iOS via FCM**: FCM can deliver to iOS devices by having them register with APNs and forward the device token to FCM. This is the recommended path for cross-platform apps — one backend integration instead of two.

### onesignal

Sign up at <https://onesignal.com>, create an app, copy the App ID and REST API Key from Settings → Keys & IDs. The REST API Key (not the User Auth Key) is what the backend uses.

```
PUSH_PROVIDER=onesignal
ONESIGNAL_APP_ID=...
ONESIGNAL_API_KEY=...              # REST API key
```

Pure REST — no SDK dep. The provider passes up to 2000 `player_id`s per request via `include_player_ids`; larger fan-outs are chunked automatically.

**Single-message vs batch**: OneSignal returns one notification id per request, not per recipient. The provider synthesizes per-recipient results by reporting the same `messageId` for every recipient in the batch.

### expo (for Expo-built React Native apps)

```
PUSH_PROVIDER=expo
EXPO_ACCESS_TOKEN=...              # optional; raises rate limits
```

Works without credentials (rate-limited by Expo). Set `EXPO_ACCESS_TOKEN` for higher limits.

**Recipient tokens** are `ExponentPushToken[xxxxxxxxxx]` strings obtained client-side via the Expo SDK's `Notifications.getExpoPushTokenAsync()`.

**Batching**: Expo recommends up to 100 messages per request. The provider automatically chunks.

**Per-message failures**: Expo returns a "ticket" per message in the batch. Tickets with `status: 'error'` (e.g. `DeviceNotRegistered` for stale tokens) are surfaced as `{ accepted: false, error }` in the bulk result so callers can remove dead tokens from the device table.

### apns (planned #21)

Not yet implemented. `PUSH_PROVIDER=apns` logs a warning and falls back to `none`. For iOS push today, use `fcm` — FCM delivers to APNs under the hood and saves you from maintaining a separate APNs integration.

### none (default if unset)

Every method throws `PushProviderNotConfiguredError`. The startup log prints which env var to set.

## Device token table

Regardless of provider, you'll want a `device_tokens` table keyed on `user_id` that stores:
- `token` (provider-specific format)
- `provider` (so migrations between providers don't mix tokens)
- `platform` (web / ios / android)
- `last_seen_at`
- `invalid_at` (set when a send fails with a "token not registered" error)

The push module doesn't ship this table — it's application-level concerns. Wire `PushService.sendBulk(tokens, message)` into your notification service and have it mark tokens with `accepted: false && error.includes('NotRegistered'|410|404)` as invalid.

## Public bootstrap endpoint

```
GET /api/v1/config/push
```

Returns only public-safe fields:

```json
{
  "provider": "webpush",
  "vapidPublicKey": "BJ...",
  "oneSignalAppId": null,
  "fcmConfig": null,
  "extra": null
}
```

The frontend PWA calls this once on page load to know which provider to bootstrap (service worker registration for webpush, OneSignal SDK for onesignal, Firebase web SDK for fcm).

## Adding a new provider

1. Implement `PushProvider` in
   `backend/src/modules/push/providers/<name>.provider.ts`
2. Add a case to `createPushProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. If the provider needs a package, add it to `optionalDependencies`
   in `backend/package.json` and `require()` it inside `loadSdk()`.
5. Add smoke-test coverage in
   `backend/scripts/smoke-test-push-providers.ts` — mock `require()`
   (see how webpush / fcm are tested) or mock `fetch` (see onesignal / expo).
