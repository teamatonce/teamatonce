/**
 * Smoke test for the multi-provider storage factory.
 *
 * Exercises the factory + each provider against the real filesystem (for
 * local-fs) and against mocked availability checks (for the cloud providers
 * that need real credentials). Does NOT hit any remote service.
 *
 * Run with: npx ts-node scripts/smoke-test-storage-providers.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import {
  createStorageProvider,
  StorageProviderNotConfiguredError,
} from '../src/modules/storage/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
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
  console.log('=== Storage provider factory smoke test ===\n');

  // 1. none (no env at all, no legacy R2)
  console.log('1. no STORAGE_PROVIDER, no legacy R2 → none');
  {
    const p = createStorageProvider(fakeConfig({}));
    ok(p.name === 'none');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'put fails loudly',
        () => p.put('bucket', 'key', Buffer.from('x')),
        (e) => e instanceof StorageProviderNotConfiguredError,
      ),
    );
  }

  // 2. legacy R2 env vars → infer r2
  console.log('\n2. legacy R2_* vars set (no STORAGE_PROVIDER) → r2');
  {
    const p = createStorageProvider(
      fakeConfig({
        R2_ACCOUNT_ID: 'abc123',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
      }),
    );
    ok(p.name === 'r2');
    console.log(`  ✅ inferred: ${p.name}`);
    ok(p.isAvailable() === true);
    console.log(`  ✅ isAvailable()=true`);
  }

  // 3. local-fs with a temp dir — full happy path
  console.log('\n3. local-fs (real filesystem happy path)');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vasty-storage-'));
    try {
      const p = createStorageProvider(
        fakeConfig({
          STORAGE_PROVIDER: 'local-fs',
          LOCAL_FS_PATH: tmp,
          LOCAL_FS_PUBLIC_URL: '/uploads',
        }),
      );
      ok(p.name === 'local-fs');
      ok(p.isAvailable() === true);
      console.log(`  ✅ factory + availability`);

      const body = Buffer.from('hello world', 'utf-8');
      const put = await p.put('products', 'images/abc.jpg', body, {
        contentType: 'image/jpeg',
      });
      ok(put.size === body.length);
      ok(put.url === '/uploads/products/images/abc.jpg');
      console.log(`  ✅ put → ${put.url}`);

      const exists = await p.exists('products', 'images/abc.jpg');
      ok(exists === true);
      console.log(`  ✅ exists=true`);

      const got = await p.get('products', 'images/abc.jpg');
      ok(got.toString('utf-8') === 'hello world');
      console.log(`  ✅ round-trip read`);

      const listed = await p.list('products', 'images');
      ok(listed.length === 1 && listed[0].key.endsWith('abc.jpg'));
      console.log(`  ✅ list returned ${listed.length} object`);

      const signed = await p.getSignedUrl(
        'products',
        'images/abc.jpg',
        60,
      );
      ok(/\?exp=\d+&sig=[a-f0-9]+$/.test(signed));
      console.log(`  ✅ signed URL: ${signed.slice(0, 60)}...`);

      await p.delete('products', 'images/abc.jpg');
      const stillExists = await p.exists('products', 'images/abc.jpg');
      ok(stillExists === false);
      console.log(`  ✅ delete worked`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 4. local-fs rejects path traversal
  console.log('\n4. local-fs rejects path traversal');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vasty-storage-'));
    try {
      const p = createStorageProvider(
        fakeConfig({ STORAGE_PROVIDER: 'local-fs', LOCAL_FS_PATH: tmp }),
      );
      ok(
        await expectThrow(
          'put with ../../ rejected',
          () => p.put('b', '../../etc/passwd', Buffer.from('x')),
          (e) => /path traversal/.test(e.message),
        ),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 5. s3 without creds → unavailable
  console.log('\n5. STORAGE_PROVIDER=s3 without creds → unavailable');
  {
    const p = createStorageProvider(fakeConfig({ STORAGE_PROVIDER: 's3' }));
    ok(p.name === 's3');
    ok(p.isAvailable() === false);
    console.log(`  ✅ factory + unavailable`);
    ok(
      await expectThrow(
        'put throws NotConfigured',
        () => p.put('b', 'k', Buffer.from('x')),
        (e) => e instanceof StorageProviderNotConfiguredError,
      ),
    );
  }

  // 6. r2 with STORAGE_* set
  console.log('\n6. STORAGE_PROVIDER=r2 with STORAGE_* vars → available');
  {
    const p = createStorageProvider(
      fakeConfig({
        STORAGE_PROVIDER: 'r2',
        STORAGE_ACCESS_KEY_ID: 'k',
        STORAGE_SECRET_ACCESS_KEY: 's',
        STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      }),
    );
    ok(p.name === 'r2');
    ok(p.isAvailable() === true);
    console.log(`  ✅ r2 configured via STORAGE_*`);
  }

  // 7. minio without endpoint → unavailable (endpoint is required)
  console.log('\n7. STORAGE_PROVIDER=minio without endpoint → unavailable');
  {
    const p = createStorageProvider(
      fakeConfig({
        STORAGE_PROVIDER: 'minio',
        STORAGE_ACCESS_KEY_ID: 'k',
        STORAGE_SECRET_ACCESS_KEY: 's',
      }),
    );
    ok(p.name === 'minio');
    ok(p.isAvailable() === false);
    console.log(`  ✅ minio requires STORAGE_ENDPOINT`);
  }

  // 8. unknown → fall back to none with warning
  console.log('\n8. STORAGE_PROVIDER=foobar → none (fallback)');
  {
    const p = createStorageProvider(fakeConfig({ STORAGE_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
    console.log(`  ✅ unknown fell back to: ${p.name}`);
  }

  // 9. gcs / azure instantiate without SDK installed (they lazy-load at call time)
  console.log('\n9. gcs instantiates with project id (SDK lazy-loaded)');
  {
    const p = createStorageProvider(
      fakeConfig({
        STORAGE_PROVIDER: 'gcs',
        GCS_PROJECT_ID: 'my-project',
      }),
    );
    ok(p.name === 'gcs');
    ok(p.isAvailable() === true);
    console.log(`  ✅ gcs available=true (SDK not yet loaded)`);
  }

  console.log('\n10. azure without connection string → unavailable');
  {
    const p = createStorageProvider(
      fakeConfig({ STORAGE_PROVIDER: 'azure' }),
    );
    ok(p.name === 'azure');
    ok(p.isAvailable() === false);
    console.log(`  ✅ azure requires connection string`);
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
