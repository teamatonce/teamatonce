import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { AiProviderService } from './ai-provider.service';
import { AuthModule } from '../auth/auth.module';

/**
 * AI module.
 *
 * Exposes three services:
 *
 * - `AiProviderService` (NEW, pluggable)
 *   The façade over the multi-provider adapter. New code should inject
 *   this. Switch providers with `AI_PROVIDER` in .env — see
 *   `docs/providers/ai.md`.
 *
 * - `AIService` (legacy, OpenAI-hardcoded)
 *   Still exported for backwards compatibility. A follow-up PR will
 *   migrate its internals to delegate to `AiProviderService`.
 *
 * - `EmbeddingService` (legacy, OpenAI-hardcoded)
 *   Still exported for backwards compatibility. A follow-up PR will
 *   route its calls through `AiProviderService.generateEmbedding()`.
 */
@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [AIController],
  providers: [AIService, EmbeddingService, AiProviderService],
  exports: [AIService, EmbeddingService, AiProviderService],
})
export class AIModule {}
