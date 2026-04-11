/**
 * Ollama provider — local LLMs, fully offline, zero API cost.
 *
 *   AI_PROVIDER=ollama
 *   OLLAMA_BASE_URL=http://localhost:11434    # default
 *   AI_MODEL=llama3.2                         # text model
 *   AI_VISION_MODEL=llava                     # vision model
 *   AI_EMBEDDING_MODEL=nomic-embed-text       # embeddings model
 *
 * Ollama (https://ollama.com) is a local LLM runner. Install it,
 * `ollama pull llama3.2 && ollama pull llava && ollama pull nomic-embed-text`,
 * and set `AI_PROVIDER=ollama`. You get unlimited offline text
 * generation, vision, and embeddings for free.
 *
 * This is the recommended default for local development — new
 * contributors don't need an OpenAI API key to run the app.
 *
 * Run via `docker compose --profile ollama up -d` (once install PR #27 lands).
 *
 * Pure REST via fetch — no SDK needed.
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

export class OllamaProvider implements AiProvider {
  readonly name = 'ollama' as const;
  private readonly logger = new Logger('OllamaProvider');

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultVisionModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434') ||
      'http://localhost:11434'
    ).replace(/\/+$/, '');
    this.defaultModel = config.get<string>('AI_MODEL', 'llama3.2');
    this.defaultVisionModel = config.get<string>('AI_VISION_MODEL', 'llava');
    this.defaultEmbeddingModel = config.get<string>(
      'AI_EMBEDDING_MODEL',
      'nomic-embed-text',
    );

    this.logger.log(
      `Ollama provider configured (${this.baseUrl}, model=${this.defaultModel})`,
    );
  }

  isAvailable(): boolean {
    // Always reportable-available; actual reachability is checked on
    // first call. Unlike a cloud provider, there's no "credential"
    // that could be missing — just a local HTTP server that might or
    // might not be running.
    return true;
  }

  private async api(path: string, body: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama API ${path} failed: ${res.status} ${text}`);
      }
      return res.json();
    } catch (e: any) {
      if (e.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(e.message)) {
        throw new AiProviderNotConfiguredError('ollama', [
          `OLLAMA_BASE_URL (${this.baseUrl} unreachable — start with "ollama serve" or "docker compose --profile ollama up -d")`,
        ]);
      }
      throw e;
    }
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const model = input.model ?? this.defaultModel;
    // Ollama's /api/chat endpoint accepts { messages } in the same
    // shape as OpenAI, except `options.temperature` instead of
    // top-level temperature, and `num_predict` instead of max_tokens.
    const payload: any = {
      model,
      messages: input.messages,
      stream: false,
      options: {
        temperature: input.temperature ?? 0.7,
        num_predict: input.maxTokens ?? 2000,
      },
    };
    if (input.jsonMode) {
      payload.format = 'json';
    }

    const res = (await this.api('/api/chat', payload)) as {
      message: { content: string };
      model: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: res.message?.content ?? '',
      model: res.model,
      provider: 'ollama',
      usage: {
        promptTokens: res.prompt_eval_count,
        completionTokens: res.eval_count,
        totalTokens:
          (res.prompt_eval_count ?? 0) + (res.eval_count ?? 0),
      },
    };
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    const model = input.model ?? this.defaultVisionModel;

    // Ollama expects base64 images (without data: prefix) in an
    // `images` array on the user message.
    let base64: string;
    if (input.image.startsWith('data:')) {
      base64 = input.image.replace(/^data:[^;]+;base64,/, '');
    } else if (/^https?:\/\//.test(input.image)) {
      // Fetch the URL and base64-encode locally. Ollama doesn't
      // accept remote URLs directly.
      const res = await fetch(input.image);
      if (!res.ok) {
        throw new Error(
          `Ollama provider: failed to fetch image URL ${input.image}: ${res.status}`,
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      base64 = buf.toString('base64');
    } else {
      // Assume it's already base64.
      base64 = input.image;
    }

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: input.prompt,
          images: [base64],
        },
      ],
      stream: false,
      options: {
        num_predict: input.maxTokens ?? 2000,
      },
    };

    const res = (await this.api('/api/chat', payload)) as {
      message: { content: string };
      model: string;
    };

    return {
      text: res.message?.content ?? '',
      model: res.model,
      provider: 'ollama',
    };
  }

  async generateEmbedding(
    input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    const model = input.model ?? this.defaultEmbeddingModel;
    const texts = Array.isArray(input.text) ? input.text : [input.text];

    // Ollama's /api/embed takes `input: string | string[]` and
    // returns `{ embeddings: number[][] }`.
    const res = (await this.api('/api/embed', {
      model,
      input: texts,
    })) as { embeddings: number[][] };

    return {
      embeddings: res.embeddings ?? [],
      model,
      provider: 'ollama',
      dimensions: res.embeddings?.[0]?.length ?? 0,
    };
  }
}
