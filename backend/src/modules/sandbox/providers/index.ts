/**
 * Sandbox provider factory.
 *
 * Reads SANDBOX_PROVIDER from config and returns the matching provider.
 *
 * Shipped in this PR:
 *   sandpack  — DEFAULT. Client-side only, metadata provider
 *   judge0    — server-side execution via Judge0
 *   piston    — server-side execution via Piston
 *   none      — disabled
 *
 * Planned follow-ups (tracked in issue #36):
 *   stackblitz   — StackBlitz WebContainers
 *   codesandbox  — CodeSandbox Devboxes API
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SandboxProvider } from './sandbox-provider.interface';
import { SandpackProvider } from './sandpack.provider';
import { Judge0Provider } from './judge0.provider';
import { PistonProvider } from './piston.provider';
import { NoneSandboxProvider } from './none.provider';

const log = new Logger('SandboxProviderFactory');

export function createSandboxProvider(config: ConfigService): SandboxProvider {
  const choice = (config.get<string>('SANDBOX_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'sandpack': {
      const p = new SandpackProvider(config);
      log.log(
        `Selected sandbox provider: sandpack (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'judge0': {
      const p = new Judge0Provider(config);
      log.log(
        `Selected sandbox provider: judge0 (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'piston': {
      const p = new PistonProvider(config);
      log.log(
        `Selected sandbox provider: piston (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'stackblitz':
    case 'stackblitz-webcontainers':
    case 'codesandbox':
    case 'codesandbox-devboxes': {
      log.warn(
        `SANDBOX_PROVIDER="${choice}" is planned but not yet implemented (see issue #36). Falling back to "none". Implemented providers: sandpack, judge0, piston.`,
      );
      return new NoneSandboxProvider();
    }
    case 'none':
    case '':
      return new NoneSandboxProvider();
    default:
      log.warn(
        `Unknown SANDBOX_PROVIDER="${choice}". Falling back to "none". Valid values: sandpack, judge0, piston, none.`,
      );
      return new NoneSandboxProvider();
  }
}

export * from './sandbox-provider.interface';
export { SandpackProvider } from './sandpack.provider';
export { Judge0Provider } from './judge0.provider';
export { PistonProvider } from './piston.provider';
export { NoneSandboxProvider } from './none.provider';
