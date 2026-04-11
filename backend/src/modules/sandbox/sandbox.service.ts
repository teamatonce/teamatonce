/**
 * SandboxService — code execution façade.
 *
 * Assessment grading, lesson exercises, and any other feature that
 * needs to run user-submitted code should inject this service.
 *
 * Switching providers (sandpack → judge0 → piston) is just a matter
 * of changing `SANDBOX_PROVIDER` in .env.
 *
 * See `./providers/` and `docs/providers/sandbox.md`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createSandboxProvider,
  ExecuteInput,
  ExecuteResult,
  FrontendSandboxConfig,
  LanguageInfo,
  SandboxProvider,
} from './providers';

@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);
  private provider!: SandboxProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createSandboxProvider(this.config);
    this.logger.log(
      `Sandbox provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    return this.provider.execute(input);
  }

  async listLanguages(): Promise<LanguageInfo[]> {
    return this.provider.listLanguages();
  }

  getFrontendConfig(): FrontendSandboxConfig {
    return this.provider.getFrontendConfig();
  }

  getProvider(): SandboxProvider {
    return this.provider;
  }
}
