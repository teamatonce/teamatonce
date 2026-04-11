/**
 * Smoke test for the SSO registry + magic-link flow.
 *
 * - SsoRegistryService: direct construction with a fake
 *   ConfigService, verifies which providers end up enabled given
 *   various AUTH_PROVIDERS values
 * - MagicLinkService: sign → verify round-trip with a fake JwtService
 *   and a mocked EmailService that captures outbound sends
 *
 * No network calls, no real JWT library, no real email delivery.
 *
 * Run with: npx ts-node scripts/smoke-test-auth-sso.ts
 */
import { ConfigService } from '@nestjs/config';
import { SsoRegistryService } from '../src/modules/auth/sso/sso-registry.service';
import { MagicLinkService } from '../src/modules/auth/sso/magic-link.service';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

// ---------------------------------------------------------------
// Fake JwtService — signs "fake-<base64(payload)>" and verifies it
// by reversing the encoding. Good enough to exercise the
// MagicLinkService's sign/verify logic without pulling in the real
// JWT library's secret config.
// ---------------------------------------------------------------
class FakeJwtService {
  private expired: Set<string> = new Set();

  sign(payload: any, options?: any): string {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json).toString('base64');
    const exp = options?.expiresIn
      ? Date.now() + options.expiresIn * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;
    return `fake-${encoded}-${exp}`;
  }

  verify<T = any>(token: string): T {
    const m = /^fake-(.+?)-(\d+)$/.exec(token);
    if (!m) throw new Error('malformed token');
    const exp = parseInt(m[2], 10);
    if (Date.now() > exp) throw new Error('expired');
    if (this.expired.has(token)) throw new Error('expired');
    const json = Buffer.from(m[1], 'base64').toString('utf-8');
    return JSON.parse(json) as T;
  }

  forceExpire(token: string) {
    this.expired.add(token);
  }
}

// ---------------------------------------------------------------
// Fake EmailService that captures outbound mail.
// ---------------------------------------------------------------
class FakeEmailService {
  public sentEmails: Array<{
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }> = [];

  public throwOnNext = false;

  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    if (this.throwOnNext) {
      this.throwOnNext = false;
      throw new Error('SMTP unreachable');
    }
    this.sentEmails.push({ to, subject, html, text });
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
  console.log('=== Auth / SSO smoke test ===\n');

  // 1. Registry: no AUTH_PROVIDERS env → only local enabled
  console.log('1. no AUTH_PROVIDERS → only local enabled (baseline)');
  {
    const reg = new SsoRegistryService(fakeConfig({}));
    reg.onModuleInit();
    const enabled = reg.getEnabled();
    ok(enabled.length === 1);
    ok(enabled[0].key === 'local');
    ok(reg.isEnabled('local') === true);
    ok(reg.isEnabled('google') === false);
    console.log(`  ✅ only local enabled by default`);
  }

  // 2. Registry: AUTH_PROVIDERS=local,google,github,magic-link
  console.log('\n2. AUTH_PROVIDERS=local,google,github,magic-link');
  {
    const reg = new SsoRegistryService(
      fakeConfig({ AUTH_PROVIDERS: 'local,google,github,magic-link' }),
    );
    reg.onModuleInit();
    const enabled = reg.getEnabled();
    ok(enabled.length === 4);
    ok(reg.isEnabled('google') === true);
    ok(reg.isEnabled('github') === true);
    ok(reg.isEnabled('magic-link') === true);
    ok(reg.isEnabled('local') === true);
    console.log(`  ✅ 4 providers enabled`);
  }

  // 3. Registry: planned provider (keycloak) → warn + skip
  console.log('\n3. AUTH_PROVIDERS=local,keycloak → keycloak skipped');
  {
    const reg = new SsoRegistryService(
      fakeConfig({ AUTH_PROVIDERS: 'local,keycloak' }),
    );
    reg.onModuleInit();
    ok(reg.isEnabled('keycloak') === false);
    ok(reg.isEnabled('local') === true);
    ok(reg.getEnabled().length === 1);
    console.log(`  ✅ planned provider skipped with warning`);
  }

  // 4. Registry: unknown provider → warn + skip
  console.log('\n4. AUTH_PROVIDERS=local,foobar → foobar ignored');
  {
    const reg = new SsoRegistryService(
      fakeConfig({ AUTH_PROVIDERS: 'local,foobar' }),
    );
    reg.onModuleInit();
    ok(reg.getEnabled().length === 1);
    ok(reg.getEnabled()[0].key === 'local');
    console.log(`  ✅ unknown provider silently dropped`);
  }

  // 5. Registry: `local` is implicit even if omitted
  console.log('\n5. AUTH_PROVIDERS=google,github → local still implicit');
  {
    const reg = new SsoRegistryService(
      fakeConfig({ AUTH_PROVIDERS: 'google,github' }),
    );
    reg.onModuleInit();
    ok(reg.isEnabled('local') === true);
    ok(reg.getEnabled().length === 3); // local + google + github
    console.log(`  ✅ local auto-added even when omitted`);
  }

  // 6. Registry: getCatalog returns full list with enabled flag
  console.log('\n6. registry.getCatalog() shows all 8 providers');
  {
    const reg = new SsoRegistryService(
      fakeConfig({ AUTH_PROVIDERS: 'google' }),
    );
    reg.onModuleInit();
    const catalog = reg.getCatalog();
    ok(catalog.length === 8); // local, google, github, gitlab, magic-link, keycloak, clerk, auth0
    const google = catalog.find((p) => p.key === 'google');
    ok(google?.enabled === true);
    ok(google?.implemented === true);
    const gitlab = catalog.find((p) => p.key === 'gitlab');
    ok(gitlab?.enabled === false);
    ok(gitlab?.implemented === false);
    console.log(`  ✅ catalog covers all 8 providers with flags`);
  }

  // 7. MagicLink: sign + verify round-trip
  console.log('\n7. MagicLink sign + verify round-trip');
  {
    const jwt = new FakeJwtService();
    const email = new FakeEmailService();
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'development', FRONTEND_URL: 'https://app.example.com' }),
      jwt as any,
      email as any,
    );
    const result = await svc.requestMagicLink('Alice@Example.Com  ');
    ok(result.success === true);
    ok(typeof result.debugToken === 'string');
    console.log(`  ✅ requestMagicLink returned debug token (dev mode)`);

    // Email was sent
    ok(email.sentEmails.length === 1);
    ok(email.sentEmails[0].to === 'alice@example.com');
    ok(email.sentEmails[0].subject.includes('sign-in'));
    ok(email.sentEmails[0].html.includes('https://app.example.com/auth/magic-link?token='));
    ok(email.sentEmails[0].text?.includes('https://app.example.com/auth/magic-link?token=') === true);
    console.log(`  ✅ email captured with expected body`);

    // Verify the token
    const verifiedEmail = svc.verifyToken(result.debugToken!);
    ok(verifiedEmail === 'alice@example.com');
    console.log(`  ✅ verify returned normalized email`);
  }

  // 8. MagicLink: production mode hides debugToken
  console.log('\n8. MagicLink production mode → no debugToken');
  {
    const jwt = new FakeJwtService();
    const email = new FakeEmailService();
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'production' }),
      jwt as any,
      email as any,
    );
    const result = await svc.requestMagicLink('bob@example.com');
    ok(result.success === true);
    ok(result.debugToken === undefined);
    console.log(`  ✅ debugToken omitted in production`);
  }

  // 9. MagicLink: verify rejects tampered token
  console.log('\n9. MagicLink verify rejects tampered token');
  {
    const jwt = new FakeJwtService();
    const email = new FakeEmailService();
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'development' }),
      jwt as any,
      email as any,
    );
    try {
      svc.verifyToken('not-a-real-token');
      ok(false, 'expected throw');
    } catch (e: any) {
      ok(/invalid or expired/i.test(e.message));
      console.log(`  ✅ tampered token rejected: "${e.message.slice(0, 60)}..."`);
    }
  }

  // 10. MagicLink: verify rejects wrong purpose
  console.log('\n10. MagicLink verify rejects wrong-purpose token');
  {
    const jwt = new FakeJwtService();
    const wrongPurposeToken = jwt.sign({ sub: 'a@b.com', email: 'a@b.com', purpose: 'reset' }, { expiresIn: 900 });
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'development' }),
      jwt as any,
      new FakeEmailService() as any,
    );
    try {
      svc.verifyToken(wrongPurposeToken);
      ok(false);
    } catch (e: any) {
      ok(/purpose/i.test(e.message));
      console.log(`  ✅ wrong purpose rejected`);
    }
  }

  // 11. MagicLink: email send failure doesn't throw (enumeration protection)
  console.log('\n11. MagicLink request swallows email send failure');
  {
    const jwt = new FakeJwtService();
    const email = new FakeEmailService();
    email.throwOnNext = true;
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'development' }),
      jwt as any,
      email as any,
    );
    const result = await svc.requestMagicLink('unreachable@example.com');
    // Still returns success
    ok(result.success === true);
    ok(typeof result.debugToken === 'string');
    // Email was not captured
    ok(email.sentEmails.length === 0);
    console.log(`  ✅ SMTP failure didn't throw; token still issued`);
  }

  // 12. MagicLink: invalid email syntax throws
  console.log('\n12. MagicLink rejects invalid email');
  {
    const svc = new MagicLinkService(
      fakeConfig({ NODE_ENV: 'development' }),
      new FakeJwtService() as any,
      new FakeEmailService() as any,
    );
    try {
      await svc.requestMagicLink('not-an-email');
      ok(false);
    } catch (e: any) {
      ok(/invalid email/i.test(e.message));
      console.log(`  ✅ invalid email rejected`);
    }
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
