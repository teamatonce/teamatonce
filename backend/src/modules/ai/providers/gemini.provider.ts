/**
 * Google Gemini provider.
 *
 *   AI_PROVIDER=gemini
 *   GEMINI_API_KEY=...
 *   AI_MODEL=gemini-2.0-flash-exp        # optional text default
 *   AI_VISION_MODEL=gemini-2.0-flash-exp # optional vision default
 *   AI_EMBEDDING_MODEL=text-embedding-004
 *
 * Pure REST via fetch. Gemini's API lives at generativelanguage.googleapis.com
 * and uses a `contents` array of `{ role, parts: [{ text } | { inlineData } | ...] }`.
 *
 * System instructions go in a separate `system_instruction` field — the
 * provider handles the translation.
 *
 * Free tier is generous and multimodal handling is excellent. Great
 * default for vision-heavy e-commerce workflows (product photo
 * autofill) when budget matters.
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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly logger = new Logger('GeminiProvider');

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultVisionModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY', '');
    this.defaultModel = config.get<string>('AI_MODEL', 'gemini-2.0-flash-exp');
    this.defaultVisionModel = config.get<string>(
      'AI_VISION_MODEL',
      this.defaultModel,
    );
    this.defaultEmbeddingModel = config.get<string>(
      'AI_EMBEDDING_MODEL',
      'text-embedding-004',
    );

    if (this.isAvailable()) {
      this.logger.log(`Gemini provider configured (model=${this.defaultModel})`);
    } else {
      this.logger.warn('Gemini provider selected but GEMINI_API_KEY missing');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private async api(model: string, endpoint: string, body: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new AiProviderNotConfiguredError('gemini', ['GEMINI_API_KEY']);
    }
    // Send the key via the x-goog-api-key header rather than a
    // URL query string. Middleware / access logs / error-tracking
    // (Sentry, Datadog) routinely capture full URLs on failure,
    // and a key in ?key=... ends up leaked in plaintext the first
    // time Gemini returns a non-2xx. Header placement keeps it
    // out of URL-based telemetry.
    const url = `${GEMINI_API_BASE}/models/${model}:${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Gemini API ${endpoint}(${model}) failed: ${res.status} ${text}`,
      );
    }
    return res.json();
  }

  private translateMessages(input: GenerateTextInput): {
    system?: { parts: Array<{ text: string }> };
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  } {
    const systems: string[] = [];
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }> = [];
    for (const msg of input.messages) {
      if (msg.role === 'system') {
        systems.push(msg.content);
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }
    return {
      system:
        systems.length > 0
          ? { parts: [{ text: systems.join('\n\n') }] }
          : undefined,
      contents,
    };
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const { system, contents } = this.translateMessages(input);
    const model = input.model ?? this.defaultModel;

    const payload: any = {
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxTokens ?? 2000,
      },
    };
    if (system) payload.system_instruction = system;
    if (input.jsonMode) {
      payload.generationConfig.response_mime_type = 'application/json';
    }

    const res = (await this.api(model, 'generateContent', payload)) as {
      candidates: Array<{
        content: { parts: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text =
      res.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('') ?? '';

    return {
      text,
      model,
      provider: 'gemini',
      usage: res.usageMetadata
        ? {
            promptTokens: res.usageMetadata.promptTokenCount,
            completionTokens: res.usageMetadata.candidatesTokenCount,
            totalTokens: res.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult> {
    const model = input.model ?? this.defaultVisionModel;

    // Gemini image parts: either inlineData (base64) or fileData (URI).
    // IMPORTANT: fileData.fileUri ONLY accepts `gs://` URIs returned
    // from the File API; it does NOT accept arbitrary https:// URLs.
    // The earlier version of this provider just passed the HTTPS URL
    // through, which produced opaque 400s at runtime.
    //
    // For HTTPS URLs we fetch the image ourselves, base64-encode it,
    // and send it via inlineData. The caller-side contract is
    // unchanged: `AnalyzeImageInput.image` may be a data URL or an
    // HTTPS URL.
    let imagePart: any;
    if (input.image.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(input.image);
      imagePart = {
        inlineData: {
          mimeType: m?.[1] ?? 'image/jpeg',
          data: m?.[2] ?? '',
        },
      };
    } else if (input.image.startsWith('gs://')) {
      imagePart = {
        fileData: {
          mimeType: 'image/jpeg',
          fileUri: input.image,
        },
      };
    } else if (/^https?:\/\//.test(input.image)) {
      const fetched = await fetch(input.image);
      if (!fetched.ok) {
        throw new Error(
          `Gemini analyzeImage could not fetch ${input.image}: ${fetched.status}`,
        );
      }
      const mimeType =
        fetched.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      const buf = Buffer.from(await fetched.arrayBuffer());
      imagePart = {
        inlineData: {
          mimeType,
          data: buf.toString('base64'),
        },
      };
    } else {
      throw new Error(
        `Gemini analyzeImage: unsupported image reference "${input.image.slice(0, 60)}...". Use data:, http(s):, or gs:// URIs.`,
      );
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [imagePart, { text: input.prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 2000,
      },
    };

    const res = (await this.api(model, 'generateContent', payload)) as {
      candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
      usageMetadata?: any;
    };
    const text =
      res.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('') ?? '';

    return {
      text,
      model,
      provider: 'gemini',
      usage: res.usageMetadata
        ? {
            promptTokens: res.usageMetadata.promptTokenCount,
            completionTokens: res.usageMetadata.candidatesTokenCount,
            totalTokens: res.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  async generateEmbedding(
    input: GenerateEmbeddingInput,
  ): Promise<GenerateEmbeddingResult> {
    const model = input.model ?? this.defaultEmbeddingModel;
    const texts = Array.isArray(input.text) ? input.text : [input.text];

    // Gemini embeddings uses a slightly different endpoint
    // batchEmbedContents for multi-text, embedContent for single.
    if (texts.length === 1) {
      const res = (await this.api(model, 'embedContent', {
        content: { parts: [{ text: texts[0] }] },
      })) as { embedding: { values: number[] } };
      return {
        embeddings: [res.embedding.values],
        model,
        provider: 'gemini',
        dimensions: res.embedding.values.length,
      };
    }

    const res = (await this.api(model, 'batchEmbedContents', {
      requests: texts.map((t) => ({
        model: `models/${model}`,
        content: { parts: [{ text: t }] },
      })),
    })) as { embeddings: Array<{ values: number[] }> };

    return {
      embeddings: res.embeddings.map((e) => e.values),
      model,
      provider: 'gemini',
      dimensions: res.embeddings[0]?.values.length ?? 0,
    };
  }
}
