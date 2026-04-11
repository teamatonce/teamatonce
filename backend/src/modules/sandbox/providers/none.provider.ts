/**
 * "None" sandbox provider — code execution disabled.
 *
 * The default if SANDBOX_PROVIDER is unset. Every method throws
 * SandboxProviderNotConfiguredError so assessment / lesson flows
 * fail loudly instead of silently returning empty output (which
 * would mask broken wiring during development).
 */
import { Logger } from '@nestjs/common';
import {
  ExecuteInput,
  ExecuteResult,
  FrontendSandboxConfig,
  LanguageInfo,
  SandboxProvider,
  SandboxProviderNotConfiguredError,
} from './sandbox-provider.interface';

export class NoneSandboxProvider implements SandboxProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneSandboxProvider');

  constructor() {
    this.logger.log(
      'Code sandbox is DISABLED (SANDBOX_PROVIDER not set). To enable, set SANDBOX_PROVIDER to one of: sandpack, judge0, piston. See docs/providers/sandbox.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new SandboxProviderNotConfiguredError('none', [
      `SANDBOX_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async execute(_input: ExecuteInput): Promise<ExecuteResult> {
    return this.fail('execute');
  }

  async listLanguages(): Promise<LanguageInfo[]> {
    return [];
  }

  getFrontendConfig(): FrontendSandboxConfig {
    return {
      provider: 'none',
      extra: { disabled: true },
    };
  }
}
