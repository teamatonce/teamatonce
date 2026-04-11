/**
 * Common interface that every AI / LLM provider implements.
 *
 * Pick a provider by setting AI_PROVIDER in your .env to one of:
 *
 *   openai     - OpenAI (https://platform.openai.com). GPT-4o family,
 *                vision, highest-quality default.
 *
 *   anthropic  - Anthropic Claude (https://console.anthropic.com).
 *                Best for long-context reasoning, product copy.
 *
 *   gemini     - Google Gemini (https://ai.google.dev). Cheap
 *                multimodal + long context.
 *
 *   ollama     - Ollama (https://ollama.com). Run LLMs on your own
 *                machine. Zero API cost, fully offline. Great for dev.
 *
 *   groq       - Groq (https://groq.com). Ultra-low latency Llama,
 *                Mixtral, DeepSeek. OpenAI-compatible API.
 *
 *   none       - AI disabled. Every method throws loudly.
 *                The default if AI_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/ai.md.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateTextInput {
  /** Messages array (system + user turns). */
  messages: ChatMessage[];
  /** Model id override; defaults to each provider's sensible default. */
  model?: string;
  /** Max tokens to generate. Default 2000. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.7. */
  temperature?: number;
  /** If set, the provider will try to return JSON (OpenAI/Gemini support
   * this natively; others will prompt for it in the system message). */
  jsonMode?: boolean;
}

export interface GenerateTextResult {
  /** Full generated text. */
  text: string;
  /** Model the provider actually used. */
  model: string;
  /** Provider name. */
  provider: string;
  /** Token usage if the provider reports it. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AnalyzeImageInput {
  /** Image as a publicly-reachable URL OR a base64 data URI. */
  image: string;
  /** Instruction / question about the image. */
  prompt: string;
  /** Vision model override. */
  model?: string;
  /** Max tokens for the response. */
  maxTokens?: number;
}

export interface GenerateEmbeddingInput {
  /** Text to embed. Batches are allowed — providers will split if needed. */
  text: string | string[];
  /** Embedding model override. */
  model?: string;
}

export interface GenerateEmbeddingResult {
  /** One vector per input string. */
  embeddings: number[][];
  /** Embedding model used. */
  model: string;
  /** Provider name. */
  provider: string;
  /** Dimensionality of each vector. */
  dimensions: number;
}

/**
 * Common interface implemented by every AI provider. Methods a provider
 * can't support should throw AiProviderNotSupportedError — never silently
 * no-op.
 */
export interface AiProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'openai'
    | 'anthropic'
    | 'gemini'
    | 'ollama'
    | 'groq'
    | 'none';

  /** True if the provider has the credentials/infra it needs. */
  isAvailable(): boolean;

  /** Generate text from a chat-message input. */
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;

  /** Analyze an image. Throws NotSupported for providers without vision. */
  analyzeImage(input: AnalyzeImageInput): Promise<GenerateTextResult>;

  /** Generate an embedding vector. Throws NotSupported for providers
   * without an embeddings endpoint (e.g. Ollama without the right model). */
  generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult>;
}

/**
 * Thrown when a provider is asked to do something it can't support
 * (e.g. image analysis on a text-only model).
 */
export class AiProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" AI provider. See docs/providers/ai.md for provider capabilities.`,
    );
    this.name = 'AiProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class AiProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `AI provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/ai.md.`,
    );
    this.name = 'AiProviderNotConfiguredError';
  }
}
