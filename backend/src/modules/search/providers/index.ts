/**
 * Search provider factory.
 *
 * Reads SEARCH_PROVIDER from config and returns the matching provider.
 *
 * Shipped in this PR:
 *   pg-trgm       — zero-infra Postgres default (recommended for dev)
 *   meilisearch   — production recommendation
 *   typesense     — alternative to meilisearch
 *   none          — disabled
 *
 * Planned follow-ups (tracked in issue #22):
 *   qdrant        — vector search
 *   weaviate      — hybrid search
 *   elasticsearch — enterprise search stack
 *
 * Selecting one of the planned values logs a warning and falls back
 * to 'none' until its provider is implemented. This is intentional:
 * a fake stub would hide the fact that the adapter isn't ready.
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SearchProvider } from './search-provider.interface';
import { PgTrgmProvider, PgQueryFn } from './pg-trgm.provider';
import { MeilisearchProvider } from './meilisearch.provider';
import { TypesenseProvider } from './typesense.provider';
import { NoneSearchProvider } from './none.provider';

const log = new Logger('SearchProviderFactory');

export interface SearchProviderFactoryDeps {
  config: ConfigService;
  /** Raw SQL query function, needed by the pg-trgm provider. */
  pgQuery: PgQueryFn;
}

export function createSearchProvider(
  deps: SearchProviderFactoryDeps,
): SearchProvider {
  const choice = (deps.config.get<string>('SEARCH_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'pg-trgm':
    case 'pg_trgm':
    case 'postgres':
    case 'pg': {
      const p = new PgTrgmProvider(deps.pgQuery);
      log.log(`Selected search provider: pg-trgm (available=${p.isAvailable()})`);
      return p;
    }
    case 'meilisearch':
    case 'meili': {
      const p = new MeilisearchProvider(deps.config);
      log.log(
        `Selected search provider: meilisearch (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'typesense': {
      const p = new TypesenseProvider(deps.config);
      log.log(
        `Selected search provider: typesense (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'qdrant':
    case 'weaviate':
    case 'elasticsearch':
    case 'elastic': {
      log.warn(
        `SEARCH_PROVIDER="${choice}" is planned but not yet implemented (see issue #22). Falling back to "none". Implemented providers: pg-trgm, meilisearch, typesense.`,
      );
      return new NoneSearchProvider();
    }
    case 'none':
    case '':
      return new NoneSearchProvider();
    default:
      log.warn(
        `Unknown SEARCH_PROVIDER="${choice}". Falling back to "none". Valid values: pg-trgm, meilisearch, typesense, none.`,
      );
      return new NoneSearchProvider();
  }
}

export * from './search-provider.interface';
export { PgTrgmProvider, PgQueryFn } from './pg-trgm.provider';
export { MeilisearchProvider } from './meilisearch.provider';
export { TypesenseProvider } from './typesense.provider';
export { NoneSearchProvider } from './none.provider';
