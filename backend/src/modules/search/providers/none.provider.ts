/**
 * "None" search provider — search is disabled.
 *
 * The default if SEARCH_PROVIDER is unset. Every method throws
 * SearchProviderNotConfiguredError so calling code fails loudly
 * rather than silently returning empty results (which would mask
 * real wiring bugs in development).
 */
import { Logger } from '@nestjs/common';
import {
  SearchableDocument,
  SearchProvider,
  SearchProviderNotConfiguredError,
  SearchQuery,
  SearchResult,
} from './search-provider.interface';

export class NoneSearchProvider implements SearchProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneSearchProvider');

  constructor() {
    this.logger.log(
      'Search is DISABLED (SEARCH_PROVIDER not set). To enable, set SEARCH_PROVIDER to one of: pg-trgm, meilisearch, typesense. See docs/providers/search.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new SearchProviderNotConfiguredError('none', [
      `SEARCH_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async indexDocument(
    _collection: string,
    _document: SearchableDocument,
  ): Promise<void> {
    return this.fail('indexDocument');
  }

  async indexBatch(
    _collection: string,
    _documents: SearchableDocument[],
  ): Promise<void> {
    return this.fail('indexBatch');
  }

  async deleteDocument(_collection: string, _id: string): Promise<void> {
    return this.fail('deleteDocument');
  }

  async search<T = SearchableDocument>(
    _collection: string,
    _query: SearchQuery,
  ): Promise<SearchResult<T>> {
    return this.fail('search');
  }

  async reindex(
    _collection: string,
    _source: AsyncIterable<SearchableDocument>,
  ): Promise<number> {
    return this.fail('reindex');
  }
}
