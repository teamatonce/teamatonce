/**
 * Smoke test for the multi-provider sandbox factory.
 *
 * - sandpack: metadata-only, no network; verifies config + throws
 *   on execute()
 * - judge0 / piston: mock fetch to verify URL, auth headers,
 *   base64 encoding, payload shape, and response translation
 * - none: throws
 *
 * Run with: npx ts-node scripts/smoke-test-sandbox-providers.ts
 */
import { ConfigService } from '@nestjs/config';
import {
  createSandboxProvider,
  SandboxProviderNotConfiguredError,
  SandboxProviderNotSupportedError,
} from '../src/modules/sandbox/providers';

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
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.parse(init.body) : null,
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
  console.log('=== Sandbox provider factory smoke test ===\n');

  // 1. none default
  console.log('1. no SANDBOX_PROVIDER → none');
  {
    const p = createSandboxProvider(fakeConfig({}));
    ok(p.name === 'none');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'execute fails loudly',
        () =>
          p.execute({ language: 'python', source: 'print(1)' }),
        (e) => e instanceof SandboxProviderNotConfiguredError,
      ),
    );
    const config = p.getFrontendConfig();
    ok(config.provider === 'none');
    ok((config.extra as any)?.disabled === true);
  }

  // 2. sandpack metadata + listLanguages
  console.log('\n2. sandpack metadata');
  {
    const p = createSandboxProvider(
      fakeConfig({ SANDBOX_PROVIDER: 'sandpack' }),
    );
    ok(p.name === 'sandpack');
    ok(p.isAvailable() === true);
    const config = p.getFrontendConfig();
    ok(config.template === 'react-ts');
    const langs = await p.listLanguages();
    ok(langs.length >= 10);
    ok(langs.some((l) => l.id === 'react-ts'));
    ok(langs.some((l) => l.id === 'vanilla'));
    console.log(`  ✅ sandpack: ${langs.length} templates, default=${config.template}`);
  }

  // 3. sandpack execute() throws NotSupported
  console.log('\n3. sandpack execute() throws NotSupported (browser-only)');
  {
    const p = createSandboxProvider(
      fakeConfig({ SANDBOX_PROVIDER: 'sandpack' }),
    );
    ok(
      await expectThrow(
        'sandpack execute throws',
        () => p.execute({ language: 'javascript', source: 'console.log(1)' }),
        (e) => e instanceof SandboxProviderNotSupportedError,
      ),
    );
  }

  // 4. sandpack custom template from env
  console.log('\n4. sandpack with SANDPACK_TEMPLATE=vue-ts');
  {
    const p = createSandboxProvider(
      fakeConfig({
        SANDBOX_PROVIDER: 'sandpack',
        SANDPACK_TEMPLATE: 'vue-ts',
      }),
    );
    ok(p.getFrontendConfig().template === 'vue-ts');
    console.log(`  ✅ custom template applied`);
  }

  // 5. judge0 without URL → unavailable
  console.log('\n5. judge0 without JUDGE0_URL → unavailable');
  {
    const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'judge0' }));
    ok(p.name === 'judge0');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'execute throws NotConfigured',
        () => p.execute({ language: 'python', source: 'print(1)' }),
        (e) => e instanceof SandboxProviderNotConfiguredError,
      ),
    );
  }

  // 6. judge0 happy path — verifies base64 encoding + status parsing
  console.log('\n6. judge0 execute (mocked)');
  {
    // Judge0 responds with base64-encoded output fields
    const stdoutB64 = Buffer.from('hello\n', 'utf-8').toString('base64');
    const stderrB64 = '';

    installMockFetch((url) => {
      if (url.includes('/submissions') && url.includes('wait=true')) {
        return {
          status: 201,
          body: {
            stdout: stdoutB64,
            stderr: stderrB64,
            compile_output: null,
            exit_code: 0,
            time: '0.012',
            memory: 1024,
            status: { id: 3, description: 'Accepted' },
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createSandboxProvider(
        fakeConfig({
          SANDBOX_PROVIDER: 'judge0',
          JUDGE0_URL: 'http://localhost:2358',
        }),
      );
      ok(p.isAvailable() === true);
      const result = await p.execute({
        language: 'python',
        source: 'print("hello")',
        stdin: '',
        timeLimitSeconds: 3,
      });
      ok(result.stdout === 'hello\n');
      ok(result.exitCode === 0);
      ok(result.timeLimitExceeded === false);
      ok(result.memoryKb === 1024);
      ok(result.durationMs === 12);
      ok(result.provider === 'judge0');
      console.log(
        `  ✅ judge0 decoded stdout: "${result.stdout.trim()}" (exit=${result.exitCode}, ${result.durationMs}ms)`,
      );

      const call = fetchCalls[fetchCalls.length - 1];
      ok(
        call.url ===
          'http://localhost:2358/submissions?base64_encoded=true&wait=true',
      );
      // Verify base64 encoding of the source
      const expectedSource = Buffer.from('print("hello")', 'utf-8').toString(
        'base64',
      );
      ok(call.body.source_code === expectedSource);
      ok(call.body.language_id === 71); // python
      ok(call.body.cpu_time_limit === 3);
      console.log(`  ✅ source base64-encoded + python language_id=71`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 7. judge0 time-limit-exceeded status
  console.log('\n7. judge0 time limit exceeded (status=5)');
  {
    installMockFetch(() => ({
      status: 201,
      body: {
        stdout: null,
        stderr: null,
        exit_code: null,
        status: { id: 5, description: 'Time Limit Exceeded' },
      },
    }));
    try {
      const p = createSandboxProvider(
        fakeConfig({
          SANDBOX_PROVIDER: 'judge0',
          JUDGE0_URL: 'http://localhost:2358',
        }),
      );
      const result = await p.execute({
        language: 'python',
        source: 'while True: pass',
      });
      ok(result.timeLimitExceeded === true);
      ok(result.exitCode === null);
      console.log(`  ✅ TLE correctly flagged`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8. judge0 RapidAPI headers
  console.log('\n8. judge0 with RapidAPI credentials → X-RapidAPI-* headers');
  {
    installMockFetch(() => ({
      status: 201,
      body: {
        stdout: Buffer.from('ok', 'utf-8').toString('base64'),
        status: { id: 3 },
        exit_code: 0,
      },
    }));
    try {
      const p = createSandboxProvider(
        fakeConfig({
          SANDBOX_PROVIDER: 'judge0',
          JUDGE0_URL: 'https://judge0-ce.p.rapidapi.com',
          JUDGE0_API_KEY: 'rapid-key',
          JUDGE0_API_HOST: 'judge0-ce.p.rapidapi.com',
        }),
      );
      await p.execute({ language: 'javascript', source: 'console.log(1)' });
      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.headers['X-RapidAPI-Key'] === 'rapid-key');
      ok(call.headers['X-RapidAPI-Host'] === 'judge0-ce.p.rapidapi.com');
      console.log(`  ✅ RapidAPI headers attached`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 9. judge0 unknown language → throws
  console.log('\n9. judge0 unknown language → throws');
  {
    const p = createSandboxProvider(
      fakeConfig({
        SANDBOX_PROVIDER: 'judge0',
        JUDGE0_URL: 'http://localhost:2358',
      }),
    );
    ok(
      await expectThrow(
        'unknown language rejected',
        () => p.execute({ language: 'brainfuck', source: '+++' }),
        (e) => /does not know language/.test(e.message),
      ),
    );
  }

  // 10. piston is always available
  console.log('\n10. piston defaults to public instance');
  {
    const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'piston' }));
    ok(p.name === 'piston');
    ok(p.isAvailable() === true);
    console.log(`  ✅ piston available without config`);
  }

  // 11. piston happy path
  console.log('\n11. piston execute (mocked)');
  {
    installMockFetch((url) => {
      if (url.includes('/execute')) {
        return {
          status: 200,
          body: {
            language: 'python',
            version: '3.10.0',
            run: {
              stdout: 'hello\n',
              stderr: '',
              code: 0,
              signal: null,
              output: 'hello\n',
            },
          },
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'piston' }));
      const result = await p.execute({
        language: 'python',
        source: 'print("hello")',
      });
      ok(result.stdout === 'hello\n');
      ok(result.exitCode === 0);
      ok(result.provider === 'piston');

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://emkc.org/api/v2/piston/execute');
      ok(call.body.language === 'python');
      ok(call.body.version === '*');
      ok(call.body.files[0].content === 'print("hello")');
      console.log(`  ✅ piston execute correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 12. piston signal=SIGKILL → timeLimitExceeded
  console.log('\n12. piston signal=SIGKILL → timeLimitExceeded');
  {
    installMockFetch(() => ({
      status: 200,
      body: {
        run: {
          stdout: '',
          stderr: '',
          code: null,
          signal: 'SIGKILL',
          output: '',
        },
      },
    }));
    try {
      const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'piston' }));
      const result = await p.execute({
        language: 'python',
        source: 'while True: pass',
      });
      ok(result.timeLimitExceeded === true);
      ok(result.exitCode === null);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 13. piston language aliases
  console.log('\n13. piston normalizes aliases (js → javascript)');
  {
    installMockFetch(() => ({
      status: 200,
      body: {
        run: { stdout: '', stderr: '', code: 0, signal: null, output: '' },
      },
    }));
    try {
      const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'piston' }));
      await p.execute({ language: 'js', source: 'console.log(1)' });
      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.body.language === 'javascript');
      console.log(`  ✅ js → javascript alias`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 14. planned stubs fall back to none
  console.log('\n14. stackblitz / codesandbox planned stubs → none');
  {
    ok(
      createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'stackblitz' }))
        .name === 'none',
    );
    ok(
      createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'codesandbox' }))
        .name === 'none',
    );
    console.log(`  ✅ planned stubs fall back to none with warning`);
  }

  // 15. unknown value
  console.log('\n15. unknown SANDBOX_PROVIDER → none (fallback)');
  {
    const p = createSandboxProvider(fakeConfig({ SANDBOX_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
