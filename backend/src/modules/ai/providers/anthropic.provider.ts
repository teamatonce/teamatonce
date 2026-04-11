/**
 * Anthropic (Claude) provider.
 *
 *   AI_PROVIDER=anthropic
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   AI_MODEL=claude-sonnet-4-5          # optional (default shown)
 *
 * Pure REST via fetch. Anthropic's Messages API (/v1/messages) takes
 * a separate `system` field outside the messages array, and returns
 * content as an array of blocks instead of a single string — this
 * provider translates to/from the unified `GenerateTextInput/Result`
 * shape so callers stay provider-agnostic.
 *
 * Claude is excellent at long-context reasoning and product copy.
 * Embeddings are NOT supported (Anthropic has no embeddings endpoint
 * as of this writing) — the provider throws AiProviderNotSupportedError.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderNotConfiguredError,
  AiProviderNotSupportedError,
  AnalyzeImageInput,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateTextInput,
  GenerateTextResult,
} from './ai-provider.interface';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly logger = new Logger('AnthropicProvider');

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultVisionModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ANTHROPIC_API_KEY', '');
    this.defaultModel = config.get<string>('AI_MODEL', 'claude-sonnet-4-5');
    this.defaultVisionModel = config.get<string>(
      'AI_VISION_MODEL',
      this.defaultModel,
    );

    if (this.isAvailable()) {
      this.logger.log(
        `Anthropic provider configured (model=${this.defaultModel})`,
      );
    } else {
      this.logger.warn(
        'Anthropic provider selected but ANTHROPIC_API_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private async api(path: string, body: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new AiProviderNotConfiguredError('anthropic', ['ANTHROPIC_API_KEY']);
    }
    const res = await fetch(`${ANTHROPIC_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  /**
   * Anthropic's Messages API takes `system` as a separate top-level
   * field, not as a message. Split the caller's messages accordingly.
   */
  private splitSystemMessages(input: GenerateTextInput): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const systems: string[] = [];
    const rest: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of input.messages) {
      if (msg.role === 'system') {
        systems.push(msg.content);
      } else {
        rest.push({ role: msg.role, content: msg.content });
      }
    }
    return {
      system: systems.length > 0 ? systems.join('\n\n') : undefined,
      messages: rest,
    };
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const { system, messages } = this.splitSystemMessages(input);

    // jsonMode: Anthropic doesn't have a native JSON mode, so prepend
    // a system instruction asking for JSON only.
    const systemText = input.jsonMode
      ? `${system ?? ''}\n\nRespond with ONLY a valid JSON object. No prose, no markdown code fences.`.trim()
      : system;

    const res = (await this.api('/messages', {
      model: input.model ?? this.defaultModel,
      max_tokens: input.maxTokens ?? 2000,
      temperature: input.temperature ?? 0.7,
      system: systemText,
      messages,
    })) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    // Claude returns content as an array of content blocks; we only
    // emit text blocks (no tool use yet).
    const text = (res.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      model: res.model,
      provider: 'anthropic',
      usage: res.usage
        ? {
            promptTokens: res.usage.input_tokens,
            completionTokens: res.usage.output_tokens,
            totalTokens:
              (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    // Anthropic accepts images as `{ type: 'image', source: { type:
    // 'base64'|'url', ... } }` blocks inside a user message.
    const imageBlock = input.image.startsWith('data:')
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: this.extractDataUriMediaType(input.image) ?? 'image/jpeg',
            data: input.image.replace(/^data:[^;]+;base64,/, ''),
          },
        }
      : {
          type: 'image' as const,
          source: { type: 'url' as const, url: input.image },
        };

    const res = (await this.api('/messages', {
      model: input.model ?? this.defaultVisionModel,
      max_tokens: input.maxTokens ?? 2000,
      messages: [
        {
          role: 'user',
          content: [
            imageBlock,
            { type: 'text', text: input.prompt },
          ],
        },
      ],
    })) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage?: any;
    };

    const text = (res.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      model: res.model,
      provider: 'anthropic',
      usage: res.usage
        ? {
            promptTokens: res.usage.input_tokens,
            completionTokens: res.usage.output_tokens,
          }
        : undefined,
    };
  }

  async generateEmbedding(
    _input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    throw new AiProviderNotSupportedError(
      'anthropic',
      'generateEmbedding (Anthropic has no embeddings endpoint — use Voyage AI, OpenAI, or a local embedding model for vectors)',
    );
  }

  private extractDataUriMediaType(dataUri: string): string | null {
    const m = /^data:([^;]+);/.exec(dataUri);
    return m?.[1] ?? null;
  }
}
