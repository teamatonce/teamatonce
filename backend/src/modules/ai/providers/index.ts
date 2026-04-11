/**
 * AI provider factory.
 *
 * Reads AI_PROVIDER from config and returns the matching provider.
 * Unknown values fall back to 'none' with a warning.
 *
 * Add a new provider by:
 *   1. Implementing AiProvider in <name>.provider.ts
 *   2. Adding a case to createAiProvider() below
 *   3. Documenting env vars in docs/providers/ai.md
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AiProvider } from './ai-provider.interface';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider } from './ollama.provider';
import { GroqProvider } from './groq.provider';
import { NoneAiProvider } from './none.provider';

const log = new Logger('AiProviderFactory');

export function createAiProvider(config: ConfigService): AiProvider {
  const choice = (config.get<string>('AI_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'openai':
    case 'gpt': {
      const p = new OpenAiProvider(config);
      log.log(`Selected AI provider: openai (available=${p.isAvailable()})`);
      return p;
    }
    case 'anthropic':
    case 'claude': {
      const p = new AnthropicProvider(config);
      log.log(
        `Selected AI provider: anthropic (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'gemini':
    case 'google': {
      const p = new GeminiProvider(config);
      log.log(`Selected AI provider: gemini (available=${p.isAvailable()})`);
      return p;
    }
    case 'ollama':
    case 'local': {
      const p = new OllamaProvider(config);
      log.log(`Selected AI provider: ollama (available=${p.isAvailable()})`);
      return p;
    }
    case 'groq': {
      const p = new GroqProvider(config);
      log.log(`Selected AI provider: groq (available=${p.isAvailable()})`);
      return p;
    }
    case 'none':
    case '':
      return new NoneAiProvider();
    default:
      log.warn(
        `Unknown AI_PROVIDER="${choice}". Falling back to "none". Valid values: openai, anthropic, gemini, ollama, groq, none.`,
      );
      return new NoneAiProvider();
  }
}

export * from './ai-provider.interface';
export { OpenAiProvider } from './openai.provider';
export { AnthropicProvider } from './anthropic.provider';
export { GeminiProvider } from './gemini.provider';
export { OllamaProvider } from './ollama.provider';
export { GroqProvider } from './groq.provider';
export { NoneAiProvider } from './none.provider';
