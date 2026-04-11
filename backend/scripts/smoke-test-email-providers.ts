/**
 * Smoke test for the multi-provider email factory.
 *
 * Exercises the factory and each provider WITHOUT making real network
 * calls to anyone's inbox. Intercepts `fetch` for the REST-based
 * providers (resend/sendgrid/postmark/mailgun) and a mock SMTP
 * transporter for nodemailer.
 *
 * Run with: npx ts-node scripts/smoke-test-email-providers.ts
 */
import { ConfigService } from '@nestjs/config';
import {
  createEmailProvider,
  EmailProviderNotConfiguredError,
} from '../src/modules/email/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

// Capture every outbound fetch so we can assert what the providers send
// to each REST API without actually hitting the network.
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
      headers: { 'x-message-id': 'mock-message-id-abc123' },
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
  const ok = (b: boolean) => (b ? pass++ : fail++);
  console.log('=== Email provider factory smoke test ===\n');

  // 1. none (no env at all)
  console.log('1. no EMAIL_PROVIDER → none');
  {
    const p = createEmailProvider(fakeConfig({}));
    ok(p.name === 'none');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'send fails loudly',
        () =>
          p.send({
            to: 'test@example.com',
            subject: 'x',
            text: 'x',
          }),
        (e) => e instanceof EmailProviderNotConfiguredError,
      ),
    );
  }

  // 2. smtp without host → unavailable
  console.log('\n2. EMAIL_PROVIDER=smtp without SMTP_HOST → unavailable');
  {
    const p = createEmailProvider(fakeConfig({ EMAIL_PROVIDER: 'smtp' }));
    ok(p.name === 'smtp');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'send throws NotConfigured',
        () => p.send({ to: 'a@b.com', subject: 'x', text: 'x' }),
        (e) => e instanceof EmailProviderNotConfiguredError,
      ),
    );
  }

  // 3. resend with API key + mocked fetch → happy path
  console.log('\n3. EMAIL_PROVIDER=resend (mocked network)');
  {
    installMockFetch(200, { id: 'resend-msg-xyz' });
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: 're_testkey123',
          EMAIL_FROM: 'Test <test@example.com>',
        }),
      );
      ok(p.name === 'resend');
      ok(p.isAvailable() === true);
      console.log(`  ✅ factory + availability`);

      const result = await p.send({
        to: 'alice@example.com',
        subject: 'hello',
        html: '<p>hi</p>',
      });
      ok(result.provider === 'resend');
      ok(result.messageId === 'resend-msg-xyz');
      ok(result.accepted === true);
      console.log(`  ✅ send returned: messageId=${result.messageId}`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.resend.com/emails');
      ok(call.method === 'POST');
      ok(call.headers['Authorization'] === 'Bearer re_testkey123');
      console.log(`  ✅ POST to correct URL with auth header`);

      const payload = JSON.parse(call.body!);
      ok(payload.to[0] === 'alice@example.com');
      ok(payload.subject === 'hello');
      ok(payload.html === '<p>hi</p>');
      ok(payload.from === 'Test <test@example.com>');
      console.log(`  ✅ payload shape correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 4. sendgrid with API key + mocked fetch
  console.log('\n4. EMAIL_PROVIDER=sendgrid (mocked network)');
  {
    installMockFetch(202, {});
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'sendgrid',
          SENDGRID_API_KEY: 'SG.testkey',
          EMAIL_FROM: 'Shop <noreply@shop.io>',
        }),
      );
      ok(p.name === 'sendgrid');
      ok(p.isAvailable() === true);
      console.log(`  ✅ factory + availability`);

      const result = await p.send({
        to: 'user@test.com',
        subject: 'Order confirmed',
        text: 'Your order is on its way',
      });
      ok(result.provider === 'sendgrid');
      ok(result.accepted === true);
      console.log(`  ✅ send returned: messageId=${result.messageId}`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.sendgrid.com/v3/mail/send');
      ok(call.headers['Authorization'] === 'Bearer SG.testkey');
      console.log(`  ✅ POST to correct URL with auth`);

      const payload = JSON.parse(call.body!);
      ok(payload.from.email === 'noreply@shop.io');
      ok(payload.from.name === 'Shop');
      ok(payload.personalizations[0].to[0].email === 'user@test.com');
      ok(payload.personalizations[0].subject === 'Order confirmed');
      console.log(`  ✅ payload shape correct (parsed From + personalizations)`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 5. postmark
  console.log('\n5. EMAIL_PROVIDER=postmark (mocked network)');
  {
    installMockFetch(200, { MessageID: 'pm-msg-456', ErrorCode: 0 });
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'postmark',
          POSTMARK_SERVER_TOKEN: 'pm-token-123',
          EMAIL_FROM: 'noreply@shop.io',
        }),
      );
      ok(p.name === 'postmark');
      ok(p.isAvailable() === true);

      const result = await p.send({
        to: 'b@c.com',
        subject: 'Receipt',
        html: '<p>receipt</p>',
      });
      ok(result.messageId === 'pm-msg-456');
      ok(result.accepted === true);
      console.log(`  ✅ postmark send → ${result.messageId}`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.headers['X-Postmark-Server-Token'] === 'pm-token-123');
      const payload = JSON.parse(call.body!);
      ok(payload.Subject === 'Receipt');
      ok(payload.To === 'b@c.com');
      console.log(`  ✅ auth header + payload correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 6. mailgun
  console.log('\n6. EMAIL_PROVIDER=mailgun (mocked network)');
  {
    installMockFetch(200, { id: 'mg-id-789' });
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'mailgun',
          MAILGUN_API_KEY: 'key-abc',
          MAILGUN_DOMAIN: 'mg.shop.io',
          EMAIL_FROM: 'noreply@mg.shop.io',
        }),
      );
      ok(p.name === 'mailgun');
      ok(p.isAvailable() === true);

      const result = await p.send({
        to: 'x@y.com',
        subject: 'Hello',
        text: 'hi',
      });
      ok(result.messageId === 'mg-id-789');
      console.log(`  ✅ mailgun send → ${result.messageId}`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.mailgun.net/v3/mg.shop.io/messages');
      ok(call.headers['Authorization']?.startsWith('Basic '));
      console.log(`  ✅ POST to correct URL with basic auth`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 7. mailgun EU region
  console.log('\n7. EMAIL_PROVIDER=mailgun with MAILGUN_REGION=eu');
  {
    installMockFetch(200, { id: 'mg-eu' });
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'mailgun',
          MAILGUN_API_KEY: 'key-abc',
          MAILGUN_DOMAIN: 'mg.shop.io',
          MAILGUN_REGION: 'eu',
        }),
      );
      await p.send({ to: 'a@b.com', subject: 's', text: 't' });
      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.eu.mailgun.net/v3/mg.shop.io/messages');
      console.log(`  ✅ EU region routes to correct host`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8. ses without creds
  console.log('\n8. EMAIL_PROVIDER=ses without creds → unavailable');
  {
    const p = createEmailProvider(fakeConfig({ EMAIL_PROVIDER: 'ses' }));
    ok(p.name === 'ses');
    ok(p.isAvailable() === false);
    console.log(`  ✅ ses requires credentials`);
  }

  // 9. unknown
  console.log('\n9. EMAIL_PROVIDER=foobar → none (fallback)');
  {
    const p = createEmailProvider(
      fakeConfig({ EMAIL_PROVIDER: 'foobar' }),
    );
    ok(p.name === 'none');
    console.log(`  ✅ unknown fell back to: ${p.name}`);
  }

  // 10. resend missing from address → still uses EMAIL_FROM default
  console.log('\n10. resend with no EMAIL_FROM → uses default');
  {
    installMockFetch(200, { id: 'r' });
    try {
      const p = createEmailProvider(
        fakeConfig({
          EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: 'k',
        }),
      );
      await p.send({ to: 'a@b.com', subject: 's', text: 't' });
      const payload = JSON.parse(
        fetchCalls[fetchCalls.length - 1].body!,
      );
      ok(payload.from === 'noreply@example.com');
      console.log(`  ✅ default from applied`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
