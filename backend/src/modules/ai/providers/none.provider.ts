/**
 * "None" AI provider — AI features disabled.
 *
 * The default if AI_PROVIDER is unset. Every method throws
 * AiProviderNotConfiguredError so calling code fails loudly rather
 * than silently returning empty results (which would mask real
 * wiring bugs during development).
 */
import { Logger } from '@nestjs/common';
import {
  AiProvider,
  AiProviderNotConfiguredError,
  AnalyzeImageInput,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateTextInput,
  GenerateTextResult,
} from './ai-provider.interface';

export class NoneAiProvider implements AiProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneAiProvider');

  constructor() {
    this.logger.log(
      'AI is DISABLED (AI_PROVIDER not set). To enable, set AI_PROVIDER to one of: openai, anthropic, gemini, ollama, groq. See docs/providers/ai.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new AiProviderNotConfiguredError('none', [
      `AI_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async generateText(_input: GenerateTextInput): Promise<GenerateTextResult> {
    return this.fail('generateText');
  }

  async analyzeImage(_input: AnalyzeImageInput): Promise<GenerateTextResult> {
    return this.fail('analyzeImage');
  }

  async generateEmbedding(
    _input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    return this.fail('generateEmbedding');
  }
}
