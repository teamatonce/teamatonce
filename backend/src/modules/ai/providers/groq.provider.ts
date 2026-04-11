/**
 * Groq provider — ultra-low-latency LLM inference.
 *
 *   AI_PROVIDER=groq
 *   GROQ_API_KEY=gsk_...
 *   AI_MODEL=llama-3.3-70b-versatile    # optional default
 *
 * Groq's API is OpenAI-compatible — same `/v1/chat/completions` shape.
 * This provider composes an `OpenAiProvider` internally and routes it
 * at Groq's base URL with Groq's credentials. Composition (not
 * inheritance) keeps the `readonly name` type-narrow for each class.
 *
 * Groq currently doesn't expose an embeddings endpoint — the provider
 * throws `AiProviderNotSupportedError` on `generateEmbedding`.
 *
 * Sign up at https://console.groq.com.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderNotSupportedError,
  AnalyzeImageInput,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateTextInput,
  GenerateTextResult,
} from './ai-provider.interface';
import { OpenAiProvider } from './openai.provider';

/**
 * Proxy a ConfigService so lookups for the OpenAI-shaped env vars
 * transparently return the Groq-equivalent values. Everything else
 * passes through unchanged.
 */
function groqConfigProxy(real: ConfigService): ConfigService {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return <T>(key: string, def?: T) => {
          if (key === 'OPENAI_API_KEY') {
            return (target as ConfigService).get<T>('GROQ_API_KEY', def as T);
          }
          if (key === 'OPENAI_BASE_URL') {
            return (target as ConfigService).get<T>(
              'GROQ_BASE_URL',
              'https://api.groq.com/openai/v1' as unknown as T,
            );
          }
          if (key === 'AI_MODEL') {
            return (target as ConfigService).get<T>(
              'AI_MODEL',
              'llama-3.3-70b-versatile' as unknown as T,
            );
          }
          return (target as ConfigService).get<T>(key, def as T);
        };
      }
      return (target as any)[prop];
    },
  }) as ConfigService;
}

export class GroqProvider implements AiProvider {
  readonly name = 'groq' as const;
  private readonly logger = new Logger('GroqProvider');

  /** Internal OpenAI-compatible client wired to api.groq.com. */
  private readonly inner: OpenAiProvider;

  constructor(config: ConfigService) {
    this.inner = new OpenAiProvider(groqConfigProxy(config));
    if (this.isAvailable()) {
      this.logger.log('Groq provider configured (OpenAI-compatible)');
    } else {
      this.logger.warn('Groq provider selected but GROQ_API_KEY missing');
    }
  }

  isAvailable(): boolean {
    return this.inner.isAvailable();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const res = await this.inner.generateText(input);
    return { ...res, provider: 'groq' };
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    // Groq supports vision on a subset of models (e.g. llama-3.2-90b-vision).
    // We pass through; any model mismatch surfaces as a clear API error.
    const res = await this.inner.analyzeImage(input);
    return { ...res, provider: 'groq' };
  }

  async generateEmbedding(
    _input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    throw new AiProviderNotSupportedError(
      'groq',
      'generateEmbedding (Groq has no embeddings endpoint — use OpenAI, Gemini, or Ollama for vectors)',
    );
  }
}
