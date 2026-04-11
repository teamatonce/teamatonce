/**
 * Smoke test for the multi-provider push factory.
 *
 * - webpush: mocks `require('web-push')` via a global cache override
 *   so the lazy loadSdk() resolves our fake sendNotification
 * - fcm: same pattern for `require('firebase-admin')`
 * - onesignal / expo: mock fetch to verify URL + auth + payload
 * - none: throws on every call
 *
 * Run with: npx ts-node scripts/smoke-test-push-providers.ts
 */
import * as Module from 'module';
import { ConfigService } from '@nestjs/config';
import {
  createPushProvider,
  PushProviderNotConfiguredError,
} from '../src/modules/push/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

// =====================================================================
// require() override — lets us inject fake web-push / firebase-admin
// without actually installing them. The push providers use
// `require('web-push')` inside loadSdk(), which hits Node's module
// resolver; we intercept at that layer by replacing Module.prototype.require.
// =====================================================================

const moduleMocks: Record<string, any> = {};
const originalRequire = Module.prototype.require;
function installModuleMocks() {
  (Module.prototype as any).require = function (id: string) {
    if (id in moduleMocks) return moduleMocks[id];
    return originalRequire.call(this, id);
  };
}
function restoreModuleMocks() {
  (Module.prototype as any).require = originalRequire;
}

// =====================================================================
// Fetch mock for REST providers
// =====================================================================

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};
const fetchCalls: FetchCall[] = [];
const realFetch = global.fetch;
function installMockFetch(status = 200, body: any = {}) {
  global.fetch = (async (url: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k] = String(v);
      }
    }
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : null,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
}
function restoreFetch() {
  global.fetch = realFetch;
}

async function expectThrow(
  label: string,
  fn: () => Promise<unknown>,
  matcher: (e: Error) => boolean,
): Promise<boolean> {
  try {
    await fn();
    console.log(`  ❌ ${label}: expected throw, got success`);
    return false;
  } catch (e) {
    if (matcher(e as Error)) {
      console.log(`  ✅ ${label}: threw as expected`);
      return true;
    }
    console.log(`  ❌ ${label}: wrong error: ${(e as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  const ok = (b: boolean, msg?: string) => {
    if (b) pass++;
    else {
      fail++;
      if (msg) console.log(`  ⚠️  ${msg}`);
    }
  };
  console.log('=== Push provider factory smoke test ===\n');
  installModuleMocks();

  try {
    // 1. none default
    console.log('1. no PUSH_PROVIDER → none');
    {
      const p = createPushProvider(fakeConfig({}));
      ok(p.name === 'none');
      ok(p.isAvailable() === false);
      ok(
        await expectThrow(
          'send fails loudly',
          () =>
            p.send({ token: 't' }, { title: 'T', body: 'B' }),
          (e) => e instanceof PushProviderNotConfiguredError,
        ),
      );
      const config = p.getPublicConfig();
      ok(config.provider === 'none');
      ok((config.extra as any)?.disabled === true);
      console.log(`  ✅ publicConfig reports disabled`);
    }

    // 2. webpush without VAPID → unavailable
    console.log('\n2. webpush without VAPID keys → unavailable');
    {
      const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'webpush' }));
      ok(p.name === 'webpush');
      ok(p.isAvailable() === false);
      ok(
        await expectThrow(
          'send throws NotConfigured',
          () => p.send({ token: '{}' }, { title: 'T', body: 'B' }),
          (e) => e instanceof PushProviderNotConfiguredError,
        ),
      );
    }

    // 3. webpush happy path via mocked `web-push` module
    console.log('\n3. webpush with VAPID keys + mocked web-push package');
    {
      const sendNotificationCalls: Array<{
        subscription: any;
        payload: string;
        options: any;
      }> = [];
      moduleMocks['web-push'] = {
        setVapidDetails: (_sub: string, _pub: string, _priv: string) => {
          /* noop */
        },
        sendNotification: async (
          subscription: any,
          payload: string,
          options: any,
        ) => {
          sendNotificationCalls.push({ subscription, payload, options });
          return { headers: { 'message-id': 'msg-abc-123' } };
        },
      };

      const p = createPushProvider(
        fakeConfig({
          PUSH_PROVIDER: 'webpush',
          VAPID_PUBLIC_KEY: 'BPub',
          VAPID_PRIVATE_KEY: 'BPriv',
          VAPID_SUBJECT: 'mailto:test@example.com',
        }),
      );
      ok(p.isAvailable() === true);

      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'dhkey', auth: 'authkey' },
      };
      const result = await p.send(
        { token: JSON.stringify(subscription) },
        {
          title: 'Hello',
          body: 'World',
          url: '/products/1',
          data: { orderId: '42' },
        },
      );
      ok(result.accepted === true);
      ok(result.provider === 'webpush');
      ok(result.messageId === 'msg-abc-123');
      console.log(`  ✅ sendNotification called, returned ${result.messageId}`);

      // Verify payload was JSON-stringified with the expected keys
      const call = sendNotificationCalls[0];
      ok(call !== undefined, 'sendNotification was not called');
      const parsed = JSON.parse(call!.payload);
      ok(parsed.title === 'Hello');
      ok(parsed.body === 'World');
      ok(parsed.url === '/products/1');
      ok(parsed.data?.orderId === '42');
      console.log(`  ✅ payload shape correct`);

      // Public config exposes the VAPID public key
      const config = p.getPublicConfig();
      ok(config.vapidPublicKey === 'BPub');
    }

    // 4. webpush invalid token → rejected (not thrown)
    console.log('\n4. webpush with malformed token → returns accepted=false');
    {
      moduleMocks['web-push'] = {
        setVapidDetails: () => {},
        sendNotification: async () => {
          throw new Error('dummy');
        },
      };
      const p = createPushProvider(
        fakeConfig({
          PUSH_PROVIDER: 'webpush',
          VAPID_PUBLIC_KEY: 'BPub',
          VAPID_PRIVATE_KEY: 'BPriv',
        }),
      );
      const result = await p.send(
        { token: 'not-json' },
        { title: 'T', body: 'B' },
      );
      ok(result.accepted === false);
      ok(result.error?.includes('Invalid Web Push token') === true);
      console.log(`  ✅ malformed token → accepted=false with clear error`);
    }

    // 5. fcm without creds → unavailable
    console.log('\n5. fcm without service account → unavailable');
    {
      const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'fcm' }));
      ok(p.name === 'fcm');
      ok(p.isAvailable() === false);
    }

    // 6. fcm happy path via mocked firebase-admin
    console.log('\n6. fcm with service account + mocked firebase-admin');
    {
      const sentMessages: any[] = [];
      moduleMocks['firebase-admin'] = {
        credential: {
          cert: (_arg: any) => ({ type: 'cert' }),
        },
        apps: [] as any[],
        initializeApp: (_opts: any) => {
          const app = { name: '[DEFAULT]' };
          moduleMocks['firebase-admin'].apps = [app];
          return app;
        },
        messaging: (_app: any) => ({
          send: async (msg: any) => {
            sentMessages.push(msg);
            return `fcm-msg-${sentMessages.length}`;
          },
          sendEach: async (msgs: any[]) => ({
            responses: msgs.map((_, i) => ({
              success: true,
              messageId: `fcm-batch-${i}`,
            })),
            successCount: msgs.length,
            failureCount: 0,
          }),
        }),
      };

      const serviceAccount = JSON.stringify({
        type: 'service_account',
        project_id: 'my-project',
        private_key: '...',
      });

      const p = createPushProvider(
        fakeConfig({
          PUSH_PROVIDER: 'fcm',
          FIREBASE_SERVICE_ACCOUNT: serviceAccount,
        }),
      );
      ok(p.isAvailable() === true);

      const result = await p.send(
        { token: 'fcm-device-token' },
        {
          title: 'Order shipped',
          body: 'Your order #42 is on the way',
          url: '/orders/42',
          data: { orderId: '42' },
          badge: 1,
        },
      );
      ok(result.accepted === true);
      ok(result.messageId === 'fcm-msg-1');

      const sent = sentMessages[0];
      ok(sent.token === 'fcm-device-token');
      ok(sent.notification.title === 'Order shipped');
      ok(sent.data.orderId === '42');
      ok(sent.data.url === '/orders/42');
      ok(sent.apns.payload.aps.badge === 1);
      console.log(
        `  ✅ fcm send: message shape correct (notification + data + apns + webpush)`,
      );
    }

    // 7. fcm sendBulk → sendEach batches
    console.log('\n7. fcm sendBulk uses sendEach batch API');
    {
      const p = createPushProvider(
        fakeConfig({
          PUSH_PROVIDER: 'fcm',
          FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ type: 'sa' }),
        }),
      );
      const result = await p.sendBulk(
        [
          { token: 't1' },
          { token: 't2' },
          { token: 't3' },
        ],
        { title: 'Flash sale', body: 'Starts now' },
      );
      ok(result.accepted === 3);
      ok(result.failed === 0);
      console.log(`  ✅ sendBulk → ${result.accepted} accepted, ${result.failed} failed`);
    }

    // 8. onesignal without keys → unavailable
    console.log('\n8. onesignal without keys → unavailable');
    {
      const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'onesignal' }));
      ok(p.name === 'onesignal');
      ok(p.isAvailable() === false);
    }

    // 9. onesignal happy path
    console.log('\n9. onesignal send (mocked network)');
    {
      installMockFetch(200, { id: 'os-notif-xyz' });
      try {
        const p = createPushProvider(
          fakeConfig({
            PUSH_PROVIDER: 'onesignal',
            ONESIGNAL_APP_ID: 'app-123',
            ONESIGNAL_API_KEY: 'key-abc',
          }),
        );
        ok(p.isAvailable() === true);
        const result = await p.send(
          { token: 'player-id-1' },
          {
            title: 'Flash sale',
            body: 'Starts in 10 minutes',
            url: '/sales/flash',
            tag: 'flash-sale',
          },
        );
        ok(result.accepted === true);
        ok(result.messageId === 'os-notif-xyz');

        const call = fetchCalls[fetchCalls.length - 1];
        ok(call.url === 'https://onesignal.com/api/v1/notifications');
        ok(call.headers['Authorization'] === 'Basic key-abc');
        const payload = JSON.parse(call.body!);
        ok(payload.app_id === 'app-123');
        ok(payload.include_player_ids[0] === 'player-id-1');
        ok(payload.headings.en === 'Flash sale');
        ok(payload.contents.en === 'Starts in 10 minutes');
        ok(payload.collapse_id === 'flash-sale');
        console.log(`  ✅ URL, Basic auth, payload shape correct`);
      } finally {
        restoreFetch();
        fetchCalls.length = 0;
      }
    }

    // 10. expo always available, happy path
    console.log('\n10. expo send (mocked network)');
    {
      installMockFetch(200, {
        data: [{ status: 'ok', id: 'expo-ticket-1' }],
      });
      try {
        const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'expo' }));
        ok(p.isAvailable() === true);
        const result = await p.send(
          { token: 'ExponentPushToken[abc]' },
          { title: 'Hello', body: 'World', sound: 'default' },
        );
        ok(result.accepted === true);
        ok(result.messageId === 'expo-ticket-1');

        const call = fetchCalls[fetchCalls.length - 1];
        ok(call.url === 'https://exp.host/--/api/v2/push/send');
        const payload = JSON.parse(call.body!);
        ok(Array.isArray(payload));
        ok(payload[0].to === 'ExponentPushToken[abc]');
        ok(payload[0].title === 'Hello');
        console.log(`  ✅ expo send correct`);
      } finally {
        restoreFetch();
        fetchCalls.length = 0;
      }
    }

    // 11. expo per-message error → accepted=false
    console.log('\n11. expo per-message DeviceNotRegistered → accepted=false');
    {
      installMockFetch(200, {
        data: [
          {
            status: 'error',
            message: 'DeviceNotRegistered',
          },
        ],
      });
      try {
        const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'expo' }));
        const result = await p.send(
          { token: 'ExponentPushToken[stale]' },
          { title: 'T', body: 'B' },
        );
        ok(result.accepted === false);
        ok(result.error === 'DeviceNotRegistered');
        console.log(`  ✅ stale token → accepted=false`);
      } finally {
        restoreFetch();
        fetchCalls.length = 0;
      }
    }

    // 12. expo sendBulk chunks
    console.log('\n12. expo sendBulk batches at 100');
    {
      // Build 205 recipients — should produce 3 batches (100, 100, 5)
      const recipients = Array.from({ length: 205 }, (_, i) => ({
        token: `ExponentPushToken[${i}]`,
      }));
      let callCount = 0;
      installMockFetch(200, {});
      global.fetch = (async (url: any, init: any) => {
        callCount++;
        const body = JSON.parse(init.body);
        const tickets = body.map((_: any, i: number) => ({
          status: 'ok',
          id: `tix-${callCount}-${i}`,
        }));
        return new Response(JSON.stringify({ data: tickets }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;
      try {
        const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'expo' }));
        const result = await p.sendBulk(recipients, {
          title: 'Bulk',
          body: 'Hi',
        });
        ok(callCount === 3, `expected 3 batches, got ${callCount}`);
        ok(result.accepted === 205);
        ok(result.failed === 0);
        console.log(
          `  ✅ 205 recipients → ${callCount} batches, ${result.accepted} accepted`,
        );
      } finally {
        restoreFetch();
        fetchCalls.length = 0;
      }
    }

    // 13. apns → planned fallback
    console.log('\n13. apns → planned, falls back to none');
    {
      const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'apns' }));
      ok(p.name === 'none');
      console.log(`  ✅ apns planned → fallback to none`);
    }

    // 14. unknown value
    console.log('\n14. unknown PUSH_PROVIDER → none (fallback)');
    {
      const p = createPushProvider(fakeConfig({ PUSH_PROVIDER: 'foobar' }));
      ok(p.name === 'none');
    }

    // 15. aliases
    console.log('\n15. aliases');
    {
      ok(
        createPushProvider(fakeConfig({ PUSH_PROVIDER: 'web-push' })).name ===
          'webpush',
      );
      ok(
        createPushProvider(fakeConfig({ PUSH_PROVIDER: 'firebase' })).name ===
          'fcm',
      );
      ok(
        createPushProvider(fakeConfig({ PUSH_PROVIDER: 'one-signal' }))
          .name === 'onesignal',
      );
      console.log(`  ✅ web-push→webpush, firebase→fcm, one-signal→onesignal`);
    }
  } finally {
    restoreModuleMocks();
    restoreFetch();
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
