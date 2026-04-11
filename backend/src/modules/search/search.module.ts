import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchProviderService } from './search-provider.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Search module.
 *
 * Exposes two services:
 *
 * - `SearchProviderService` (NEW, pluggable)
 *   Façade over the multi-provider adapter (pg-trgm / meilisearch /
 *   typesense / none). Pick a provider with `SEARCH_PROVIDER` in .env.
 *   See `docs/providers/search.md`. New code should inject this.
 *
 * - `SearchService` (legacy, hand-rolled Postgres)
 *   Still exported for backwards compatibility. Implements the
 *   existing `/api/v1/search/*` endpoints with hybrid keyword +
 *   semantic search. A follow-up PR will migrate it to delegate to
 *   `SearchProviderService` so content search respects the configured
 *   SEARCH_PROVIDER.
 */
@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchProviderService],
  exports: [SearchService, SearchProviderService],
})
export class SearchModule {}
