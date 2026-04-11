/**
 * OpenAI provider.
 *
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 *   AI_MODEL=gpt-4o-mini                # optional text default
 *   AI_VISION_MODEL=gpt-4o              # optional vision default
 *   AI_EMBEDDING_MODEL=text-embedding-3-small   # optional
 *
 * Pure REST via fetch — no SDK dep. The provider exposes chat
 * completions, vision, and embeddings through the standard /v1
 * endpoints.
 *
 * Also handles "OpenAI-compatible" services by honoring OPENAI_BASE_URL,
 * so you can point this at Azure OpenAI (different base URL), LiteLLM,
 * LocalAI, or any other compatible gateway.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderNotConfiguredError,
  AnalyzeImageInput,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateTextInput,
  GenerateTextResult,
} from './ai-provider.interface';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly logger = new Logger('OpenAiProvider');

  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly defaultModel: string;
  protected readonly defaultVisionModel: string;
  protected readonly defaultEmbeddingModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.baseUrl = (
      config.get<string>('OPENAI_BASE_URL', DEFAULT_BASE_URL) || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.defaultModel = config.get<string>('AI_MODEL', 'gpt-4o-mini');
    this.defaultVisionModel = config.get<string>('AI_VISION_MODEL', 'gpt-4o');
    this.defaultEmbeddingModel = config.get<string>(
      'AI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );

    if (this.isAvailable()) {
      this.logger.log(
        `OpenAI provider configured (${this.baseUrl}, model=${this.defaultModel})`,
      );
    } else {
      this.logger.warn('OpenAI provider selected but OPENAI_API_KEY missing');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  protected async api(path: string, body: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new AiProviderNotConfiguredError(this.name, ['OPENAI_API_KEY']);
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `${this.name} API ${path} failed: ${res.status} ${text}`,
      );
    }
    return res.json();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const payload: any = {
      model: input.model ?? this.defaultModel,
      messages: input.messages,
      max_tokens: input.maxTokens ?? 2000,
      temperature: input.temperature ?? 0.7,
    };
    if (input.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const res = (await this.api('/chat/completions', payload)) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    return {
      text: res.choices?.[0]?.message?.content ?? '',
      model: res.model,
      provider: this.name,
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
          }
        : undefined,
    };
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    // OpenAI's vision input goes through /chat/completions with a
    // user message containing multiple content parts.
    const payload: any = {
      model: input.model ?? this.defaultVisionModel,
      max_tokens: input.maxTokens ?? 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            {
              type: 'image_url',
              image_url: { url: input.image },
            },
          ],
        },
      ],
    };

    const res = (await this.api('/chat/completions', payload)) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: any;
    };
    return {
      text: res.choices?.[0]?.message?.content ?? '',
      model: res.model,
      provider: this.name,
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
          }
        : undefined,
    };
  }

  async generateEmbedding(
    input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    const texts = Array.isArray(input.text) ? input.text : [input.text];
    const model = input.model ?? this.defaultEmbeddingModel;
    const res = (await this.api('/embeddings', {
      model,
      input: texts,
    })) as {
      data: Array<{ embedding: number[] }>;
      model: string;
    };
    const embeddings = res.data.map((d) => d.embedding);
    return {
      embeddings,
      model: res.model,
      provider: this.name,
      dimensions: embeddings[0]?.length ?? 0,
    };
  }
}
