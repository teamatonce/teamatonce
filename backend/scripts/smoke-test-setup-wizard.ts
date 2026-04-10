/**
 * Smoke test for the setup wizard.
 *
 * Uses `prompts.inject()` to feed pre-baked answers to the wizard and
 * verifies that it runs end-to-end, writes a .env file, and the file
 * contains the expected provider selections.
 *
 * Runs in a sandbox temp dir so nothing real is touched.
 *
 * Run with: npx ts-node scripts/smoke-test-setup-wizard.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { main as runSetup, renderEnv } from './setup';

// `prompts` exports inject as a property on its CJS export object. With
// allowSyntheticDefaultImports but no esModuleInterop the default import
// resolves at type-check time but at runtime we need the CJS require.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const promptsLib = require('prompts');

async function testRenderEnv(): Promise<number> {
  let fail = 0;
  console.log('Test: renderEnv updates existing keys in place');
  {
    const baseline = 'PORT=3001\nVIDEO_PROVIDER=none\nSTORAGE_PROVIDER=\n';
    const updated = renderEnv(baseline, {
      VIDEO_PROVIDER: 'jitsi',
      STORAGE_PROVIDER: 'r2',
    });
    if (/^VIDEO_PROVIDER=jitsi$/m.test(updated) && /^STORAGE_PROVIDER=r2$/m.test(updated)) {
      console.log('  ✅ existing keys rewritten');
    } else {
      console.log('  ❌ existing keys not rewritten');
      console.log('  output:\n' + updated);
      fail++;
    }
  }

  console.log('Test: renderEnv appends new keys in an overrides block');
  {
    const baseline = 'PORT=3001\n';
    const updated = renderEnv(baseline, { NEW_VAR: 'hello' });
    if (/NEW_VAR=hello/.test(updated) && /SETUP WIZARD OVERRIDES/.test(updated)) {
      console.log('  ✅ new key appended in overrides section');
    } else {
      console.log('  ❌ new key not appended correctly');
      console.log('  output:\n' + updated);
      fail++;
    }
  }

  console.log('Test: renderEnv preserves comments and blank lines');
  {
    const baseline = '# top comment\n\nPORT=3001\n# section\nVIDEO_PROVIDER=none\n';
    const updated = renderEnv(baseline, { VIDEO_PROVIDER: 'jitsi' });
    if (updated.includes('# top comment') && updated.includes('# section')) {
      console.log('  ✅ comments preserved');
    } else {
      console.log('  ❌ comments lost');
      fail++;
    }
  }
  return fail;
}

async function testFullWizard(): Promise<number> {
  console.log('\nTest: full wizard run with injected answers');

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'teamatonce-wizard-'));
  const backendDir = path.join(sandbox, 'backend');
  fs.mkdirSync(backendDir, { recursive: true });

  const fakeEnvExample = [
    '# Sandbox .env.example',
    'PORT=3001',
    'NODE_ENV=development',
    'VIDEO_PROVIDER=none',
    'STORAGE_PROVIDER=',
    'AI_PROVIDER=',
    'EMAIL_PROVIDER=',
    'SEARCH_PROVIDER=',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(backendDir, '.env.example'), fakeEnvExample);
  const envPath = path.join(backendDir, '.env');
  const envExamplePath = path.join(backendDir, '.env.example');

  // Wizard prompts in order:
  //   1. video concern
  //   2. storage concern
  //   3. ai concern
  //   4. email concern
  //   5. search concern
  //   6. "write these to .env?"
  promptsLib.inject(['jitsi', 'r2', 'openai', 'smtp', 'qdrant', true]);

  try {
    await runSetup({ envPath, envExamplePath });
  } catch (e: any) {
    console.log(`  ❌ wizard threw: ${e.message}`);
    fs.rmSync(sandbox, { recursive: true, force: true });
    return 1;
  }

  if (!fs.existsSync(envPath)) {
    console.log(`  ❌ .env was not created`);
    fs.rmSync(sandbox, { recursive: true, force: true });
    return 1;
  }

  const written = fs.readFileSync(envPath, 'utf-8');
  const expectations: Array<[string, string]> = [
    ['VIDEO_PROVIDER', 'jitsi'],
    ['STORAGE_PROVIDER', 'r2'],
    ['AI_PROVIDER', 'openai'],
    ['EMAIL_PROVIDER', 'smtp'],
    ['SEARCH_PROVIDER', 'qdrant'],
  ];
  let fail = 0;
  for (const [key, expected] of expectations) {
    const re = new RegExp(`^${key}=${expected}$`, 'm');
    if (re.test(written)) {
      console.log(`  ✅ ${key}=${expected}`);
    } else {
      console.log(`  ❌ ${key} not set to ${expected}`);
      const actual = written.split('\n').find((l) => l.startsWith(`${key}=`));
      console.log(`     actual: ${actual ?? '(missing)'}`);
      fail++;
    }
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
  return fail;
}

async function main(): Promise<void> {
  console.log('=== Setup wizard smoke test ===\n');
  let fail = 0;
  fail += await testRenderEnv();
  fail += await testFullWizard();
  console.log(`\n=== Result: ${fail === 0 ? 'PASS' : `${fail} failures`} ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
