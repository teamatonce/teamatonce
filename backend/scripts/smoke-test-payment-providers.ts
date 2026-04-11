/**
 * Smoke test for the multi-provider payment factory.
 *
 * Mocks `fetch` to verify URL + auth + payload shape per provider.
 * Also verifies Stripe webhook HMAC-SHA256 signature flow with real
 * crypto. No real API calls.
 *
 * Run with: npx ts-node scripts/smoke-test-payment-providers.ts
 */
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  createPaymentProvider,
  PaymentProviderNotConfiguredError,
} from '../src/modules/payment/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  rawBody: string | null;
};
const fetchCalls: FetchCall[] = [];
const realFetch = global.fetch;
function installMockFetch(
  responder: (url: string, init: any) => { status: number; body: any },
) {
  global.fetch = (async (url: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k] = String(v);
      }
    }
    const rawBody = typeof init.body === 'string' ? init.body : null;
    let parsedBody: any = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // Form-urlencoded body
        parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
      }
    }
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: parsedBody,
      rawBody,
    });
    const { status, body } = responder(String(url), init);
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
  console.log('=== Payment provider factory smoke test ===\n');

  const customer = {
    name: 'Alice',
    email: 'alice@example.com',
    phone: '+8801711111111',
    country: 'BD',
  };
  const lineItems = [
    { productId: 'p1', description: 'Widget', unitAmount: 1000, quantity: 2 },
  ];

  // 1. none default
  console.log('1. no PAYMENT_PROVIDER → none');
  {
    const p = createPaymentProvider(fakeConfig({}));
    ok(p.name === 'none');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'createCheckout fails loudly',
        () =>
          p.createCheckout({
            orderReference: 'ord-1',
            currency: 'USD',
            lineItems,
            totalAmount: 2000,
            customer,
            successUrl: 'https://app.example.com/success',
            cancelUrl: 'https://app.example.com/cancel',
          }),
        (e) => e instanceof PaymentProviderNotConfiguredError,
      ),
    );
  }

  // 2. stripe without key → unavailable
  console.log('\n2. stripe without STRIPE_SECRET_KEY → unavailable');
  {
    const p = createPaymentProvider(fakeConfig({ PAYMENT_PROVIDER: 'stripe' }));
    ok(p.name === 'stripe');
    ok(p.isAvailable() === false);
  }

  // 3. stripe createCheckout
  console.log('\n3. stripe createCheckout (mocked)');
  {
    installMockFetch((url, init) => {
      if (url.endsWith('/v1/checkout/sessions') && init.method === 'POST') {
        return {
          status: 200,
          body: {
            id: 'cs_test_abc',
            url: 'https://checkout.stripe.com/pay/cs_test_abc',
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test_xxx',
        }),
      );
      ok(p.isAvailable() === true);
      const session = await p.createCheckout({
        orderReference: 'ord-42',
        currency: 'USD',
        lineItems,
        totalAmount: 2000,
        customer,
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
        metadata: { note: 'first order' },
      });
      ok(session.sessionId === 'cs_test_abc');
      ok(session.checkoutUrl.includes('checkout.stripe.com'));
      ok(session.provider === 'stripe');
      console.log(`  ✅ session ${session.sessionId}`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.headers['Authorization'] === 'Bearer sk_test_xxx');
      ok(call.headers['Content-Type'] === 'application/x-www-form-urlencoded');
      // Verify nested form keys
      ok(call.body.mode === 'payment');
      ok(call.body.client_reference_id === 'ord-42');
      ok(call.body['line_items[0][price_data][currency]'] === 'usd');
      ok(call.body['line_items[0][price_data][unit_amount]'] === '1000');
      ok(call.body['line_items[0][quantity]'] === '2');
      ok(call.body['metadata[order_reference]'] === 'ord-42');
      ok(call.body['metadata[note]'] === 'first order');
      console.log(`  ✅ nested form encoding correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 4. stripe marketplace split (single vendor)
  console.log('\n4. stripe single-vendor split → transfer_data.destination');
  {
    installMockFetch(() => ({
      status: 200,
      body: { id: 'cs_split', url: 'https://checkout.stripe.com/pay/cs_split' },
    }));
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test',
        }),
      );
      await p.createCheckout({
        orderReference: 'ord-43',
        currency: 'USD',
        lineItems: [
          {
            productId: 'p1',
            description: 'Widget',
            unitAmount: 1000,
            quantity: 1,
            vendorAccountId: 'acct_vendor_123',
          },
        ],
        totalAmount: 1000,
        platformFeeAmount: 100,
        customer,
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });
      const call = fetchCalls[fetchCalls.length - 1];
      ok(
        call.body['payment_intent_data[application_fee_amount]'] === '100',
      );
      ok(
        call.body['payment_intent_data[transfer_data][destination]'] ===
          'acct_vendor_123',
      );
      console.log(`  ✅ single-vendor split routes to transfer_data`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 5. stripe multi-vendor split → transfer_group
  console.log('\n5. stripe multi-vendor → transfer_group');
  {
    installMockFetch(() => ({
      status: 200,
      body: { id: 'cs_multi', url: 'https://checkout.stripe.com/pay/cs_multi' },
    }));
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test',
        }),
      );
      await p.createCheckout({
        orderReference: 'ord-44',
        currency: 'USD',
        lineItems: [
          {
            productId: 'p1',
            description: 'A',
            unitAmount: 500,
            quantity: 1,
            vendorAccountId: 'acct_v1',
          },
          {
            productId: 'p2',
            description: 'B',
            unitAmount: 500,
            quantity: 1,
            vendorAccountId: 'acct_v2',
          },
        ],
        totalAmount: 1000,
        customer,
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });
      const call = fetchCalls[fetchCalls.length - 1];
      ok(
        call.body['payment_intent_data[transfer_group]'] === 'order_ord-44',
      );
      // No direct transfer_data for multi-vendor
      ok(
        call.body['payment_intent_data[transfer_data][destination]'] ===
          undefined,
      );
      console.log(`  ✅ multi-vendor → transfer_group, no direct transfer_data`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 6. stripe webhook signature verification
  console.log('\n6. stripe webhook signature verification');
  {
    const p = createPaymentProvider(
      fakeConfig({
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      }),
    );
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc',
          client_reference_id: 'ord-42',
          amount_total: 2000,
          currency: 'usd',
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const v1 = crypto
      .createHmac('sha256', 'whsec_test_secret')
      .update(signedPayload)
      .digest('hex');
    const sigHeader = `t=${timestamp},v1=${v1}`;

    const event = await p.parseWebhook(payload, sigHeader);
    ok(event !== null);
    ok(event!.kind === 'payment.succeeded');
    ok(event!.paymentId === 'cs_test_abc');
    ok(event!.orderReference === 'ord-42');
    ok(event!.amount === 2000);
    ok(event!.currency === 'USD');
    console.log(`  ✅ valid signature + mapped event`);

    // Bad signature should throw
    ok(
      await expectThrow(
        'bad signature throws',
        () =>
          p.parseWebhook(
            payload,
            `t=${timestamp},v1=${'0'.repeat(64)}`,
          ),
        (e) => /signature mismatch/i.test(e.message),
      ),
    );

    // Fail-closed: if webhookSecret is set, a missing signature
    // header must throw instead of silently parsing the payload.
    ok(
      await expectThrow(
        'missing signature header throws (fail-closed)',
        () => p.parseWebhook(payload, undefined),
        (e) => /signature missing/i.test(e.message),
      ),
    );

    // Length-mismatch signatures must NOT bubble as RangeError
    // from timingSafeEqual; they should be rejected cleanly.
    ok(
      await expectThrow(
        'length-mismatch signature rejects cleanly',
        () => p.parseWebhook(payload, `t=${timestamp},v1=deadbeef`),
        (e) =>
          /signature mismatch/i.test(e.message) &&
          !/ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH/i.test(e.message),
      ),
    );

    // Replay protection: a signed payload with a 10-minute-old
    // timestamp must be rejected (tolerance window is 5 min).
    const staleTs = Math.floor(Date.now() / 1000) - 600;
    const staleSigned = `${staleTs}.${payload}`;
    const staleV1 = crypto
      .createHmac('sha256', 'whsec_test_secret')
      .update(staleSigned)
      .digest('hex');
    ok(
      await expectThrow(
        'stale timestamp rejected (replay protection)',
        () => p.parseWebhook(payload, `t=${staleTs},v1=${staleV1}`),
        (e) => /tolerance/i.test(e.message),
      ),
    );
  }

  // 7. paypal without creds → unavailable
  console.log('\n7. paypal without creds → unavailable');
  {
    const p = createPaymentProvider(fakeConfig({ PAYMENT_PROVIDER: 'paypal' }));
    ok(p.name === 'paypal');
    ok(p.isAvailable() === false);
  }

  // 8. paypal token exchange + createCheckout
  console.log('\n8. paypal createCheckout (token + orders)');
  {
    installMockFetch((url) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return {
          status: 200,
          body: { access_token: 'paypal-fake-token', expires_in: 3600 },
        };
      }
      if (url.endsWith('/v2/checkout/orders')) {
        return {
          status: 201,
          body: {
            id: 'PAYPAL-ORDER-XYZ',
            status: 'CREATED',
            links: [
              { rel: 'self', href: '...' },
              {
                rel: 'approve',
                href: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-XYZ',
              },
            ],
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'paypal',
          PAYPAL_CLIENT_ID: 'cid',
          PAYPAL_CLIENT_SECRET: 'csec',
          PAYPAL_MODE: 'sandbox',
        }),
      );
      ok(p.isAvailable() === true);
      const session = await p.createCheckout({
        orderReference: 'ord-45',
        currency: 'USD',
        lineItems,
        totalAmount: 2000,
        customer,
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });
      ok(session.sessionId === 'PAYPAL-ORDER-XYZ');
      ok(session.checkoutUrl.includes('paypal.com/checkoutnow'));
      console.log(`  ✅ paypal order created: ${session.sessionId}`);

      const tokenCall = fetchCalls.find((c) =>
        c.url.includes('/oauth2/token'),
      );
      const orderCall = fetchCalls.find((c) =>
        c.url.endsWith('/v2/checkout/orders'),
      );
      ok(!!tokenCall);
      ok(!!orderCall);
      ok(
        tokenCall!.headers['Authorization']?.startsWith('Basic '),
      );
      ok(orderCall!.headers['Authorization'] === 'Bearer paypal-fake-token');
      // Amount in decimal string, not minor units
      ok(
        orderCall!.body.purchase_units[0].amount.value === '20.00',
      );
      console.log(`  ✅ basic auth → bearer, amount formatted as decimal`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8b. paypal zero-decimal currencies format without the /100 step
  console.log('\n8b. paypal JPY amounts format as integer (zero-decimal)');
  {
    installMockFetch((url) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      }
      if (url.endsWith('/v2/checkout/orders')) {
        return {
          status: 201,
          body: {
            id: 'JPY-ORDER',
            links: [{ rel: 'approve', href: 'https://x' }],
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'paypal',
          PAYPAL_CLIENT_ID: 'cid',
          PAYPAL_CLIENT_SECRET: 'csec',
        }),
      );
      await p.createCheckout({
        orderReference: 'jp-1',
        currency: 'JPY',
        totalAmount: 1000, // 1000 yen, NOT 10 yen
        lineItems: [
          { productId: 'noodles', description: 'noodles', quantity: 1, unitAmount: 1000 },
        ],
        customer: {
          email: 't@example.com',
          name: 'Alice',
          line1: '1',
          city: 'Tokyo',
          postalCode: '100',
          country: 'JP',
        },
        successUrl: 'https://x',
        cancelUrl: 'https://x',
      });
      const orderCall = fetchCalls.find((c) =>
        c.url.endsWith('/v2/checkout/orders'),
      );
      ok(orderCall!.body.purchase_units[0].amount.value === '1000');
      ok(
        orderCall!.body.purchase_units[0].items[0].unit_amount.value === '1000',
      );
      console.log(`  ✅ JPY amount 1000 → "1000" (not "10.00")`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8c. paypal webhook without PAYPAL_WEBHOOK_ID → fail-closed
  console.log('\n8c. paypal webhook refuses to run without PAYPAL_WEBHOOK_ID');
  {
    const p = createPaymentProvider(
      fakeConfig({
        PAYMENT_PROVIDER: 'paypal',
        PAYPAL_CLIENT_ID: 'cid',
        PAYPAL_CLIENT_SECRET: 'csec',
        // PAYPAL_WEBHOOK_ID deliberately unset
      }),
    );
    ok(
      await expectThrow(
        'missing PAYPAL_WEBHOOK_ID throws',
        () => p.parseWebhook('{}', '{}'),
        (e) => /PAYPAL_WEBHOOK_ID/.test(e.message),
      ),
    );
  }

  // 8d. paypal webhook with missing transmission headers → fail-closed
  console.log('\n8d. paypal webhook rejects incomplete header bundle');
  {
    const p = createPaymentProvider(
      fakeConfig({
        PAYMENT_PROVIDER: 'paypal',
        PAYPAL_CLIENT_ID: 'cid',
        PAYPAL_CLIENT_SECRET: 'csec',
        PAYPAL_WEBHOOK_ID: 'wh-123',
      }),
    );
    ok(
      await expectThrow(
        'missing signature bundle throws',
        () => p.parseWebhook('{}', undefined),
        (e) => /bundle missing/.test(e.message),
      ),
    );
    ok(
      await expectThrow(
        'incomplete headers throw',
        () =>
          p.parseWebhook(
            '{}',
            JSON.stringify({ 'paypal-transmission-id': 'x' }),
          ),
        (e) => /headers missing/.test(e.message),
      ),
    );
  }

  // 8e. paypal webhook happy path calls verify endpoint
  console.log('\n8e. paypal webhook calls verify endpoint + returns event');
  {
    installMockFetch((url) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      }
      if (url.includes('/v1/notifications/verify-webhook-signature')) {
        return { status: 200, body: { verification_status: 'SUCCESS' } };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'paypal',
          PAYPAL_CLIENT_ID: 'cid',
          PAYPAL_CLIENT_SECRET: 'csec',
          PAYPAL_WEBHOOK_ID: 'wh-happy',
        }),
      );
      const body = JSON.stringify({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAP-1',
          amount: { value: '20.00', currency_code: 'USD' },
          custom_id: 'ord-8e',
        },
      });
      const headers = JSON.stringify({
        'paypal-transmission-id': 'tid',
        'paypal-transmission-time': '2026-01-01T00:00:00Z',
        'paypal-transmission-sig': 'sig',
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/x',
        'paypal-auth-algo': 'SHA256withRSA',
      });
      const event = await p.parseWebhook(body, headers);
      ok(event !== null);
      ok(event!.kind === 'payment.succeeded');
      ok(event!.paymentId === 'CAP-1');
      ok(event!.amount === 2000); // USD, 2-decimal
      const verifyCall = fetchCalls.find((c) =>
        c.url.includes('/v1/notifications/verify-webhook-signature'),
      );
      ok(!!verifyCall);
      ok(verifyCall!.body.webhook_id === 'wh-happy');
      ok(verifyCall!.body.auth_algo === 'SHA256withRSA');
      console.log(`  ✅ verify endpoint called + event returned`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8f. paypal webhook rejects when verify_status != SUCCESS
  console.log('\n8f. paypal webhook rejects verify_status != SUCCESS');
  {
    installMockFetch((url) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      }
      if (url.includes('/v1/notifications/verify-webhook-signature')) {
        return { status: 200, body: { verification_status: 'FAILURE' } };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'paypal',
          PAYPAL_CLIENT_ID: 'cid',
          PAYPAL_CLIENT_SECRET: 'csec',
          PAYPAL_WEBHOOK_ID: 'wh-bad',
        }),
      );
      const headers = JSON.stringify({
        'paypal-transmission-id': 'tid',
        'paypal-transmission-time': 't',
        'paypal-transmission-sig': 's',
        'paypal-cert-url': 'u',
        'paypal-auth-algo': 'a',
      });
      ok(
        await expectThrow(
          'FAILURE verification rejects',
          () =>
            p.parseWebhook(
              '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{}}',
              headers,
            ),
          (e) => /verification_status=FAILURE/.test(e.message),
        ),
      );
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 9. bkash without creds → unavailable
  console.log('\n9. bkash without creds → unavailable');
  {
    const p = createPaymentProvider(fakeConfig({ PAYMENT_PROVIDER: 'bkash' }));
    ok(p.name === 'bkash');
    ok(p.isAvailable() === false);
  }

  // 10. bkash token grant + createCheckout
  console.log('\n10. bkash createCheckout (token + create)');
  {
    installMockFetch((url) => {
      if (url.includes('/tokenized/checkout/token/grant')) {
        return {
          status: 200,
          body: {
            id_token: 'bkash-token-abc',
            expires_in: 3600,
            statusCode: '0000',
          },
        };
      }
      if (url.includes('/tokenized/checkout/create')) {
        return {
          status: 200,
          body: {
            paymentID: 'TR0011xxxxxx',
            bkashURL: 'https://sandbox.bka.sh/payment/choose?paymentID=TR0011xxxxxx',
            statusCode: '0000',
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'bkash',
          BKASH_APP_KEY: 'appkey',
          BKASH_APP_SECRET: 'appsecret',
          BKASH_USERNAME: 'user',
          BKASH_PASSWORD: 'pass',
        }),
      );
      ok(p.isAvailable() === true);
      const session = await p.createCheckout({
        orderReference: 'ord-46',
        currency: 'BDT',
        lineItems: [
          {
            productId: 'p1',
            description: 'Widget',
            unitAmount: 50000, // 500 BDT in paisa
            quantity: 1,
          },
        ],
        totalAmount: 50000,
        customer,
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });
      ok(session.sessionId === 'TR0011xxxxxx');
      ok(session.checkoutUrl.includes('sandbox.bka.sh'));
      ok(session.provider === 'bkash');

      // Verify token grant call used raw username/password headers
      const tokenCall = fetchCalls.find((c) =>
        c.url.includes('/token/grant'),
      );
      ok(!!tokenCall);
      ok(tokenCall!.headers['username'] === 'user');
      ok(tokenCall!.headers['password'] === 'pass');
      ok(tokenCall!.body.app_key === 'appkey');

      // Create call used bearer-style auth (id_token directly) +
      // x-app-key
      const createCall = fetchCalls.find((c) =>
        c.url.includes('/checkout/create'),
      );
      ok(!!createCall);
      ok(createCall!.headers['Authorization'] === 'bkash-token-abc');
      ok(createCall!.headers['x-app-key'] === 'appkey');
      // Amount in BDT decimal string
      ok(createCall!.body.amount === '500.00');
      ok(createCall!.body.currency === 'BDT');
      ok(createCall!.body.merchantInvoiceNumber === 'ord-46');
      console.log(
        `  ✅ bkash token + create with correct headers + BDT amount`,
      );
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 10b. bkash capturePayment captures trxID, refund uses it
  console.log(
    '\n10b. bkash capturePayment caches trxID; refund sends trxID ≠ paymentID',
  );
  {
    installMockFetch((url) => {
      if (url.includes('/tokenized/checkout/token/grant')) {
        return {
          status: 200,
          body: {
            id_token: 'bkash-tok',
            expires_in: 3600,
            statusCode: '0000',
          },
        };
      }
      if (url.includes('/tokenized/checkout/execute')) {
        return {
          status: 200,
          body: {
            paymentID: 'TR0011PAYMENT',
            trxID: 'CAPTUREDTRX999',
            transactionStatus: 'Completed',
            amount: '500.00',
            statusCode: '0000',
          },
        };
      }
      if (url.includes('/tokenized/checkout/payment/refund')) {
        return {
          status: 200,
          body: {
            refundTrxID: 'REFUND-1',
            amount: '500.00',
            transactionStatus: 'Completed',
            statusCode: '0000',
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createPaymentProvider(
        fakeConfig({
          PAYMENT_PROVIDER: 'bkash',
          BKASH_APP_KEY: 'appkey',
          BKASH_APP_SECRET: 'appsecret',
          BKASH_USERNAME: 'user',
          BKASH_PASSWORD: 'pass',
        }),
      );
      // Step 1: capturePayment is part of the interface and works.
      const info = await p.capturePayment('TR0011PAYMENT');
      ok(info.status === 'succeeded');
      ok(info.provider === 'bkash');

      // Step 2: refund uses the cached trxID, not the paymentID.
      await p.refund({ paymentId: 'TR0011PAYMENT', amount: 50000 });
      const refundCall = fetchCalls.find((c) =>
        c.url.includes('/tokenized/checkout/payment/refund'),
      );
      ok(!!refundCall);
      ok(refundCall!.body.paymentID === 'TR0011PAYMENT');
      ok(refundCall!.body.trxID === 'CAPTUREDTRX999');
      ok(refundCall!.body.trxID !== refundCall!.body.paymentID);
      console.log(
        `  ✅ capturePayment ok, refund uses trxID (${refundCall!.body.trxID}) ≠ paymentID`,
      );
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 11. Planned providers fall back to none
  console.log('\n11. razorpay / mollie / etc fall back to none');
  {
    for (const choice of [
      'razorpay',
      'paystack',
      'mollie',
      'mpesa',
      'square',
      'adyen',
      'lemonsqueezy',
      'sslcommerz',
      'nagad',
    ]) {
      const p = createPaymentProvider(
        fakeConfig({ PAYMENT_PROVIDER: choice }),
      );
      ok(p.name === 'none', `${choice} should fallback to none`);
    }
    console.log(`  ✅ all 9 planned providers fall back to none`);
  }

  // 12. unknown value
  console.log('\n12. unknown PAYMENT_PROVIDER → none');
  {
    const p = createPaymentProvider(fakeConfig({ PAYMENT_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
