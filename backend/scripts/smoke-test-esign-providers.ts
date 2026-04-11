/**
 * Smoke test for the multi-provider esign factory.
 *
 * Mocks `fetch` to verify URL, auth headers, payload translation,
 * signature verification, and webhook event mapping. Does NOT
 * create any real documents.
 *
 * Run with: npx ts-node scripts/smoke-test-esign-providers.ts
 */
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  createEsignProvider,
  EsignProviderNotConfiguredError,
} from '../src/modules/esign/providers';

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
  responder: (
    url: string,
    init: any,
  ) => { status: number; body: any; bodyType?: 'json' | 'binary' },
) {
  global.fetch = (async (url: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k] = String(v);
      }
    }
    const rawBody = typeof init.body === 'string' ? init.body : null;
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: rawBody ? (() => { try { return JSON.parse(rawBody); } catch { return null; } })() : init.body ?? null,
      rawBody,
    });
    const { status, body, bodyType } = responder(String(url), init);
    if (bodyType === 'binary') {
      return new Response(body as any, { status });
    }
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
  console.log('=== Esign provider factory smoke test ===\n');

  const fakePdf = Buffer.from('%PDF-1.4 fake pdf bytes', 'utf-8');
  const signers = [
    { name: 'Alice Client', email: 'alice@example.com', role: 'client' },
    {
      name: 'Bob Contractor',
      email: 'bob@example.com',
      role: 'contractor',
    },
  ];

  // 1. none default
  console.log('1. no ESIGN_PROVIDER → none');
  {
    const p = createEsignProvider(fakeConfig({}));
    ok(p.name === 'none');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'createEnvelope fails loudly',
        () =>
          p.createEnvelope({
            title: 'Test',
            documentPdf: fakePdf,
            signers,
          }),
        (e) => e instanceof EsignProviderNotConfiguredError,
      ),
    );
  }

  // 2. documenso without API token → unavailable
  console.log('\n2. documenso without token → unavailable');
  {
    const p = createEsignProvider(fakeConfig({ ESIGN_PROVIDER: 'documenso' }));
    ok(p.name === 'documenso');
    ok(p.isAvailable() === false);
  }

  // 3. documenso createEnvelope happy path
  console.log('\n3. documenso createEnvelope (mocked)');
  {
    let uploadCalled = false;
    installMockFetch((url, init) => {
      if (url.endsWith('/api/v1/documents') && init.method === 'POST') {
        return {
          status: 200,
          body: {
            id: 42,
            uploadUrl: 'https://uploads.example.com/42',
            recipients: [
              {
                email: 'alice@example.com',
                signingUrl: 'https://app.documenso.com/sign/abc',
              },
            ],
          },
        };
      }
      if (url === 'https://uploads.example.com/42' && init.method === 'PUT') {
        uploadCalled = true;
        return { status: 200, body: {} };
      }
      if (
        url.includes('/documents/42/send-for-signing') &&
        init.method === 'POST'
      ) {
        return { status: 200, body: {} };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createEsignProvider(
        fakeConfig({
          ESIGN_PROVIDER: 'documenso',
          DOCUMENSO_URL: 'https://app.documenso.com',
          DOCUMENSO_API_TOKEN: 'api_testkey',
        }),
      );
      ok(p.isAvailable() === true);
      const envelope = await p.createEnvelope({
        title: 'Contract #42',
        documentPdf: fakePdf,
        signers,
        externalReference: 'order-42',
      });

      ok(envelope.envelopeId === '42');
      ok(envelope.provider === 'documenso');
      ok(envelope.status === 'pending');
      ok(envelope.signingUrlFirstSigner?.includes('sign/abc') === true);
      console.log(`  ✅ envelope created id=${envelope.envelopeId}`);

      // Verify the POST /documents call
      const createCall = fetchCalls.find(
        (c) =>
          c.url.endsWith('/api/v1/documents') && c.method === 'POST',
      );
      ok(!!createCall);
      ok(createCall!.headers['Authorization'] === 'api_testkey');
      ok(createCall!.body.title === 'Contract #42');
      ok(createCall!.body.externalId === 'order-42');
      ok(createCall!.body.recipients.length === 2);
      ok(createCall!.body.recipients[0].email === 'alice@example.com');
      ok(createCall!.body.recipients[1].signingOrder === 2);
      console.log(`  ✅ POST payload shape correct`);

      // Verify the PDF was uploaded via PUT
      ok(uploadCalled);
      console.log(`  ✅ PDF uploaded via PUT to returned uploadUrl`);

      // Verify the send-for-signing call
      const sendCall = fetchCalls.find((c) =>
        c.url.includes('/send-for-signing'),
      );
      ok(!!sendCall);
      console.log(`  ✅ send-for-signing dispatched`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 4. documenso getEnvelope status parsing
  console.log('\n4. documenso getEnvelope status mapping');
  {
    installMockFetch(() => ({
      status: 200,
      body: {
        id: 42,
        status: 'COMPLETED',
        createdAt: '2026-04-11T00:00:00Z',
        completedAt: '2026-04-11T12:00:00Z',
        recipients: [
          {
            email: 'alice@example.com',
            name: 'Alice',
            signingStatus: 'SIGNED',
            signedAt: '2026-04-11T11:30:00Z',
          },
          {
            email: 'bob@example.com',
            name: 'Bob',
            signingStatus: 'SIGNED',
            signedAt: '2026-04-11T12:00:00Z',
          },
        ],
      },
    }));
    try {
      const p = createEsignProvider(
        fakeConfig({
          ESIGN_PROVIDER: 'documenso',
          DOCUMENSO_API_TOKEN: 'k',
        }),
      );
      const info = await p.getEnvelope('42');
      ok(info !== null);
      ok(info!.status === 'completed');
      ok(info!.signers.length === 2);
      ok(info!.signers.every((s) => s.status === 'signed'));
      ok(info!.signers[0].signedAt === '2026-04-11T11:30:00Z');
      console.log(`  ✅ completed status + signer signedAt parsed`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 5. documenso getEnvelope 404 → null
  console.log('\n5. documenso getEnvelope 404 → null');
  {
    installMockFetch(() => ({ status: 404, body: { error: 'not found' } }));
    try {
      const p = createEsignProvider(
        fakeConfig({
          ESIGN_PROVIDER: 'documenso',
          DOCUMENSO_API_TOKEN: 'k',
        }),
      );
      const info = await p.getEnvelope('does-not-exist');
      ok(info === null);
      console.log(`  ✅ 404 → null`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 6. documenso downloadSignedPdf returns Buffer
  console.log('\n6. documenso downloadSignedPdf');
  {
    const fakeSignedPdf = Buffer.from('%PDF signed content', 'utf-8');
    installMockFetch(() => ({
      status: 200,
      body: fakeSignedPdf,
      bodyType: 'binary',
    }));
    try {
      const p = createEsignProvider(
        fakeConfig({
          ESIGN_PROVIDER: 'documenso',
          DOCUMENSO_API_TOKEN: 'k',
        }),
      );
      const pdf = await p.downloadSignedPdf('42');
      ok(Buffer.isBuffer(pdf));
      ok(pdf.toString('utf-8').startsWith('%PDF'));
      console.log(`  ✅ returned ${pdf.length}-byte Buffer`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 7. documenso parseWebhook with valid HMAC signature
  console.log('\n7. documenso parseWebhook (valid signature)');
  {
    const p = createEsignProvider(
      fakeConfig({
        ESIGN_PROVIDER: 'documenso',
        DOCUMENSO_API_TOKEN: 'k',
        DOCUMENSO_WEBHOOK_SECRET: 'webhook-secret',
      }),
    );
    const payload = JSON.stringify({
      event: 'document.completed',
      payload: {
        id: 42,
        recipient: { email: 'alice@example.com' },
      },
    });
    const sig = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(payload)
      .digest('hex');
    const event = await p.parseWebhook(payload, sig);
    ok(event !== null);
    ok(event!.kind === 'envelope.completed');
    ok(event!.envelopeId === '42');
    ok(event!.signerEmail === 'alice@example.com');
    console.log(`  ✅ valid signature + mapped event`);
  }

  // 8. documenso parseWebhook with bad signature
  console.log('\n8. documenso parseWebhook rejects bad signature');
  {
    const p = createEsignProvider(
      fakeConfig({
        ESIGN_PROVIDER: 'documenso',
        DOCUMENSO_API_TOKEN: 'k',
        DOCUMENSO_WEBHOOK_SECRET: 'webhook-secret',
      }),
    );
    const payload = JSON.stringify({ event: 'document.completed' });
    const badSig =
      '0000000000000000000000000000000000000000000000000000000000000000';
    ok(
      await expectThrow(
        'bad signature throws',
        () => p.parseWebhook(payload, badSig),
        (e) => /signature mismatch/i.test(e.message),
      ),
    );
  }

  // 9. documenso parseWebhook unknown event → null
  console.log('\n9. documenso parseWebhook unknown event → null');
  {
    const p = createEsignProvider(
      fakeConfig({
        ESIGN_PROVIDER: 'documenso',
        DOCUMENSO_API_TOKEN: 'k',
        // no webhook secret → no signature verification
      }),
    );
    const event = await p.parseWebhook(
      JSON.stringify({ event: 'document.weird_internal_thing' }),
    );
    ok(event === null);
    console.log(`  ✅ unknown event returns null`);
  }

  // 10. opensign createEnvelope
  console.log('\n10. opensign createEnvelope (mocked)');
  {
    installMockFetch((url, init) => {
      if (
        url.endsWith('/api/app/functions/signdocuments') &&
        init.method === 'POST'
      ) {
        return {
          status: 200,
          body: {
            result: {
              documentId: 'os-doc-123',
              signUrl: 'https://app.opensignlabs.com/sign/xyz',
            },
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createEsignProvider(
        fakeConfig({
          ESIGN_PROVIDER: 'opensign',
          OPENSIGN_URL: 'https://app.opensignlabs.com',
          OPENSIGN_API_KEY: 'os-master-key',
        }),
      );
      ok(p.isAvailable() === true);
      const envelope = await p.createEnvelope({
        title: 'Contract',
        documentPdf: fakePdf,
        signers,
      });
      ok(envelope.envelopeId === 'os-doc-123');
      ok(envelope.provider === 'opensign');
      ok(envelope.signingUrlFirstSigner?.includes('sign/xyz') === true);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.headers['X-Parse-Master-Key'] === 'os-master-key');
      ok(call.headers['X-Parse-Application-Id'] === 'opensign');
      // PDF sent as base64
      ok(typeof call.body.file === 'string' && call.body.file.length > 0);
      ok(call.body.signers.length === 2);
      console.log(`  ✅ opensign envelope created + X-Parse headers`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 11. planned provider fallbacks
  console.log('\n11. docusign / docuseal / dropbox-sign → fallback to none');
  {
    for (const choice of ['docusign', 'docuseal', 'dropbox-sign', 'hellosign', 'signwell']) {
      const p = createEsignProvider(fakeConfig({ ESIGN_PROVIDER: choice }));
      ok(p.name === 'none', `${choice} should fallback to none`);
    }
    console.log(`  ✅ 5 planned providers all fall back to none`);
  }

  // 12. unknown value
  console.log('\n12. unknown ESIGN_PROVIDER → none');
  {
    const p = createEsignProvider(fakeConfig({ ESIGN_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
