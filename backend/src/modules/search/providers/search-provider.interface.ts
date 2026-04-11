/**
 * Common interface that every search provider implements.
 *
 * Pick a provider by setting SEARCH_PROVIDER in your .env to one of:
 *
 *   pg-trgm       - Postgres pg_trgm + tsvector full-text. Zero extra
 *                   infrastructure. Uses the existing Postgres you're
 *                   already running. The default and recommended
 *                   starting point for dev.
 *
 *   meilisearch   - Meilisearch (https://meilisearch.com). Best typo
 *                   tolerance + faceting for e-commerce. Recommended
 *                   default for production.
 *
 *   typesense     - Typesense (https://typesense.org). Fast, simple,
 *                   self-hosted alternative to Meilisearch.
 *
 *   qdrant        - Qdrant vector search. [PLANNED follow-up PR]
 *
 *   weaviate      - Weaviate hybrid search. [PLANNED follow-up PR]
 *
 *   elasticsearch - Elasticsearch/OpenSearch. [PLANNED follow-up PR]
 *
 *   none          - Search disabled. Every method throws loudly.
 *                   The default if SEARCH_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/search.md.
 */

export interface SearchableDocument {
  /** Stable document id (usually the row's primary key). */
  id: string;
  /** Arbitrary fields to index. Provider-specific handling. */
  [key: string]: any;
}

export interface SearchQuery {
  /** Free-text query. Empty string returns all documents (paginated). */
  q: string;
  /** Max results to return. Default 20. */
  limit?: number;
  /** Pagination offset. Default 0. */
  offset?: number;
  /** Field equality filters, e.g. { category: 'shoes', status: 'active' }. */
  filters?: Record<string, string | number | boolean>;
  /** Numeric range filters, e.g. { price: { gte: 10, lte: 100 } }. */
  rangeFilters?: Record<string, { gte?: number; lte?: number }>;
  /** Fields to request facet counts on. */
  facets?: string[];
  /** Sort field, provider-dependent. */
  sort?: string;
}

export interface SearchHit<T = SearchableDocument> {
  /** The raw document as stored in the index. */
  document: T;
  /** Relevance score from the search engine. Higher is better. */
  score: number;
  /** Highlighted snippets (provider-dependent, may be empty). */
  highlights?: Record<string, string[]>;
}

export interface SearchResult<T = SearchableDocument> {
  /** Matching documents. */
  hits: SearchHit<T>[];
  /** Total number of matches (may be an estimate depending on provider). */
  total: number;
  /** Facet counts, keyed by facet field name. */
  facets?: Record<string, Record<string, number>>;
  /** Query time in milliseconds, as reported by the provider. */
  tookMs?: number;
}

/**
 * Common interface implemented by every search provider. Methods a
 * provider can't support should throw SearchProviderNotSupportedError —
 * never silently no-op.
 */
export interface SearchProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'pg-trgm'
    | 'meilisearch'
    | 'typesense'
    | 'qdrant'
    | 'weaviate'
    | 'elasticsearch'
    | 'none';

  /** True if the provider has the credentials/infra it needs. */
  isAvailable(): boolean;

  /**
   * Insert or update a single document in the given collection/index.
   * Providers that index directly from Postgres (pg-trgm) may no-op
   * since the source of truth IS the Postgres table — the document
   * becomes searchable the moment it's written.
   */
  indexDocument(collection: string, document: SearchableDocument): Promise<void>;

  /**
   * Bulk insert/update documents in one batch. Default implementation
   * loops indexDocument(); providers with a native batch API override.
   */
  indexBatch(collection: string, documents: SearchableDocument[]): Promise<void>;

  /** Remove a document from the index. */
  deleteDocument(collection: string, id: string): Promise<void>;

  /** Run a search query against a collection. */
  search<T = SearchableDocument>(
    collection: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>>;

  /**
   * Rebuild the index for a collection from a source iterator. Used
   * during initial setup and after schema changes. For pg-trgm this
   * is a no-op because there's no separate index; for Meilisearch /
   * Typesense this wipes and repopulates.
   */
  reindex(
    collection: string,
    source: AsyncIterable<SearchableDocument>,
  ): Promise<number>;
}

/**
 * Thrown when a provider is asked to do something it can't support.
 */
export class SearchProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" search provider. See docs/providers/search.md for provider capabilities.`,
    );
    this.name = 'SearchProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials/infra are missing.
 */
export class SearchProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Search provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/search.md.`,
    );
    this.name = 'SearchProviderNotConfiguredError';
  }
}
