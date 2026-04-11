/**
 * AiProviderService — thin façade around the pluggable AI provider.
 *
 * New code should inject this instead of the legacy `AIService`.
 * Every module that needs text generation, vision analysis, or
 * embeddings goes through this single service — switching the
 * backend is just a matter of changing `AI_PROVIDER` in .env.
 *
 * The legacy `AIService` (ai.service.ts) still exists and still
 * directly calls OpenAI — a follow-up PR will migrate its internals
 * to delegate to this service and then delete the dead code paths.
 * This PR deliberately doesn't touch it to keep the diff reviewable.
 *
 * See `./providers/` and `docs/providers/ai.md`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAiProvider,
  AiProvider,
  AnalyzeImageInput,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateTextInput,
  GenerateTextResult,
} from './providers';

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);
  private provider!: AiProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createAiProvider(this.config);
    this.logger.log(
      `AI provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return this.provider.generateText(input);
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    return this.provider.analyzeImage(input);
  }

  async generateEmbedding(
    input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    return this.provider.generateEmbedding(input);
  }

  /**
   * Direct access to the underlying provider for advanced call sites.
   * Prefer the higher-level methods above.
   */
  getProvider(): AiProvider {
    return this.provider;
  }
}
