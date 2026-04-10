/**
 * Smoke test for the multi-provider video factory.
 *
 * Instantiates each provider with fake config and verifies:
 *   - the factory returns the right provider class
 *   - isAvailable() is correct given the (fake) env
 *   - NoneProvider fails loudly on createRoom (not silently)
 *   - Jitsi works with zero config (the critical zero-setup path)
 *   - Unknown VIDEO_PROVIDER values fall back to none with a warning
 *
 * Does NOT make any real network calls to external video services.
 * Run with: npx ts-node scripts/smoke-test-video-providers.ts
 */
import { ConfigService } from '@nestjs/config';
import {
  createVideoProvider,
  VideoProviderNotConfiguredError,
} from '../src/modules/teamatonce/communication/providers';

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

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (b: boolean) => (b ? pass++ : fail++);

  console.log('=== Video provider factory smoke test ===\n');

  // 1. none (no env at all)
  console.log('1. VIDEO_PROVIDER=none (unconfigured default)');
  {
    const p = createVideoProvider(fakeConfig({}));
    ok(p.name === 'none');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'createRoom fails loudly',
        () => p.createRoom({ roomName: 'test' }),
        (e) => e instanceof VideoProviderNotConfiguredError,
      ),
    );
  }

  // 2. jitsi (the zero-config happy path — works with no env vars)
  console.log('\n2. VIDEO_PROVIDER=jitsi (zero-config public instance)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'jitsi' }));
    ok(p.name === 'jitsi');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === true);
    console.log(`  ✅ isAvailable()=true (public meet.jit.si)`);
    const room = await p.createRoom({ roomName: 'smoke-test-room' });
    ok(!!room.joinUrl && room.joinUrl.startsWith('https://meet.jit.si/'));
    console.log(`  ✅ createRoom returned joinUrl: ${room.joinUrl}`);
    const tok = await p.generateToken(room.roomId, { identity: 'alice' });
    ok(tok.provider === 'jitsi' && !!tok.url);
    console.log(`  ✅ generateToken returned url: ${tok.url}`);
  }

  // 3. livekit — selected but missing creds → isAvailable=false, loadSdk throws
  console.log('\n3. VIDEO_PROVIDER=livekit (no creds)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'livekit' }));
    ok(p.name === 'livekit');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false (missing LIVEKIT_URL/KEY/SECRET)`);
    ok(
      await expectThrow(
        'createRoom throws NotConfigured',
        () => p.createRoom({ roomName: 'test' }),
        (e) => e instanceof VideoProviderNotConfiguredError,
      ),
    );
  }

  // 4. daily — missing creds
  console.log('\n4. VIDEO_PROVIDER=daily (no creds)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'daily' }));
    ok(p.name === 'daily');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'createRoom throws NotConfigured',
        () => p.createRoom({ roomName: 'test' }),
        (e) => e instanceof VideoProviderNotConfiguredError,
      ),
    );
  }

  // 5. agora — missing creds
  console.log('\n5. VIDEO_PROVIDER=agora (no creds)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'agora' }));
    ok(p.name === 'agora');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
    ok(
      await expectThrow(
        'createRoom throws NotConfigured',
        () => p.createRoom({ roomName: 'test' }),
        (e) => e instanceof VideoProviderNotConfiguredError,
      ),
    );
  }

  // 6. whereby — missing creds
  console.log('\n6. VIDEO_PROVIDER=whereby (no creds)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'whereby' }));
    ok(p.name === 'whereby');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    console.log(`  ✅ isAvailable()=false`);
  }

  // 7. unknown → fall back to none with warning
  console.log('\n7. VIDEO_PROVIDER=foobar (unknown, should fall back)');
  {
    const p = createVideoProvider(fakeConfig({ VIDEO_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
    console.log(`  ✅ unknown fell back to: ${p.name}`);
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
