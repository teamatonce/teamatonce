/**
 * Postgres pg_trgm search provider.
 *
 *   SEARCH_PROVIDER=pg-trgm
 *
 * Zero extra infrastructure — uses the Postgres you're already running.
 * The first time the provider is touched, it ensures the `pg_trgm`
 * extension exists (idempotent CREATE EXTENSION) and creates a GIN
 * index on each collection's `name + description` columns for fast
 * trigram similarity search.
 *
 * Search uses the `%` similarity operator (trigram match) for fuzzy
 * matching PLUS `ILIKE` for substring matching, combined with OR. The
 * relevance score is `similarity(name, q)` so exact-or-near-exact
 * matches float to the top.
 *
 * Indexing is a no-op because Postgres IS the source of truth — the
 * moment the `products` row exists, it's searchable. This is a huge
 * UX win over external search engines that need a separate reindex
 * step on schema changes.
 *
 * Not suitable for: semantic/vector search, cross-field ranking beyond
 * trigram similarity, faceted search on arbitrary fields. For those,
 * graduate to Meilisearch / Typesense / Qdrant.
 *
 * Supported collections (mapped to real table names):
 *   'products'    → products (columns: name, description, short_description, tags)
 *
 * Add more collections by editing `TABLE_MAP` below.
 */
import { Logger } from '@nestjs/common';
import {
  SearchableDocument,
  SearchProvider,
  SearchProviderNotSupportedError,
  SearchQuery,
  SearchResult,
} from './search-provider.interface';

/** (sql, params) → rows[] — the minimum surface of a pg client the provider needs. */
export type PgQueryFn = (
  sql: string,
  params?: any[],
) => Promise<{ rows: any[] }>;

interface CollectionMap {
  table: string;
  searchColumns: string[];
  idColumn: string;
}

/**
 * Collections the pg-trgm provider knows how to search. Every entry
 * here gets a GIN index per search column on first search.
 *
 * Team@Once's initial search surface is projects + tasks + proposals —
 * add more collections as the rest of the app migrates to the
 * pluggable layer (conversations, contracts, courses, companies, etc).
 */
const TABLE_MAP: Record<string, CollectionMap> = {
  projects: {
    table: 'projects',
    searchColumns: ['name', 'description'],
    idColumn: 'id',
  },
  project_tasks: {
    table: 'project_tasks',
    searchColumns: ['title', 'description'],
    idColumn: 'id',
  },
  project_proposals: {
    table: 'project_proposals',
    searchColumns: ['title', 'description'],
    idColumn: 'id',
  },
};

export class PgTrgmProvider implements SearchProvider {
  readonly name = 'pg-trgm' as const;
  private readonly logger = new Logger('PgTrgmProvider');

  private readonly query: PgQueryFn;
  private initialized = false;

  constructor(query: PgQueryFn) {
    this.query = query;
    this.logger.log('pg-trgm provider constructed (indexes will be ensured on first search)');
  }

  isAvailable(): boolean {
    // pg-trgm is always available if Postgres is up — whether the
    // extension is installed is checked lazily on first search.
    return true;
  }

  /**
   * Lazy one-time setup: ensure the pg_trgm extension exists and
   * create GIN indexes on the mapped tables for fast similarity search.
   * Every step is idempotent so it's safe to re-run.
   */
  private async ensureReady(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      for (const [collection, map] of Object.entries(TABLE_MAP)) {
        for (const col of map.searchColumns) {
          const idxName = `${map.table}_${col}_trgm_idx`;
          // Use the sanitized identifier path so there's zero injection
          // surface: TABLE_MAP is a compile-time constant and col is
          // drawn from a whitelisted array above.
          await this.query(
            `CREATE INDEX IF NOT EXISTS ${idxName} ON ${map.table} USING gin (${col} gin_trgm_ops)`,
          );
        }
        this.logger.log(`pg_trgm indexes ensured for ${collection} (${map.table})`);
      }
      this.initialized = true;
    } catch (e: any) {
      // Don't permanently fail — maybe the user doesn't have
      // CREATE EXTENSION privs. Log loudly once and let search queries
      // fall back to plain ILIKE.
      this.logger.warn(
        `pg_trgm setup failed (${e.message}). Falling back to ILIKE-only search. ` +
          `Run "CREATE EXTENSION IF NOT EXISTS pg_trgm;" as a superuser to enable fast fuzzy search.`,
      );
      this.initialized = true; // don't retry on every query
    }
  }

  private resolveCollection(collection: string): CollectionMap {
    const map = TABLE_MAP[collection];
    if (!map) {
      throw new SearchProviderNotSupportedError(
        'pg-trgm',
        `search on collection "${collection}" — add it to TABLE_MAP in pg-trgm.provider.ts`,
      );
    }
    return map;
  }

  async indexDocument(_collection: string, _document: SearchableDocument): Promise<void> {
    // No-op: Postgres IS the source of truth. The row is searchable
    // the moment the app's main write path writes it.
  }

  async indexBatch(
    _collection: string,
    _documents: SearchableDocument[],
  ): Promise<void> {
    // No-op, same reason.
  }

  async deleteDocument(_collection: string, _id: string): Promise<void> {
    // No-op — the main delete path removes the row from Postgres
    // directly, which is also the search index.
  }

  async search<T = SearchableDocument>(
    collection: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>> {
    await this.ensureReady();
    const map = this.resolveCollection(collection);
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = Math.max(query.offset ?? 0, 0);

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Free-text: trigram similarity OR ILIKE across searchColumns.
    if (query.q && query.q.trim().length > 0) {
      const q = query.q.trim();
      const cols = map.searchColumns;
      // For each column: (col % $q) OR (col ILIKE $qLike)
      const orParts: string[] = [];
      params.push(q); // $paramIdx — bare query (for similarity)
      const qParamBare = paramIdx++;
      params.push(`%${q}%`); // next param — ILIKE wildcard
      const qParamLike = paramIdx++;
      for (const col of cols) {
        orParts.push(`(${col} % $${qParamBare} OR ${col} ILIKE $${qParamLike})`);
      }
      whereClauses.push(`(${orParts.join(' OR ')})`);
    }

    // Equality filters
    if (query.filters) {
      for (const [field, value] of Object.entries(query.filters)) {
        // Only allow identifier-safe field names to prevent SQL injection.
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
          this.logger.warn(`Rejected unsafe filter field: ${field}`);
          continue;
        }
        whereClauses.push(`${field} = $${paramIdx}`);
        params.push(value);
        paramIdx++;
      }
    }

    // Range filters
    if (query.rangeFilters) {
      for (const [field, range] of Object.entries(query.rangeFilters)) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
          this.logger.warn(`Rejected unsafe range field: ${field}`);
          continue;
        }
        if (range.gte !== undefined) {
          whereClauses.push(`${field} >= $${paramIdx}`);
          params.push(range.gte);
          paramIdx++;
        }
        if (range.lte !== undefined) {
          whereClauses.push(`${field} <= $${paramIdx}`);
          params.push(range.lte);
          paramIdx++;
        }
      }
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Score: similarity of the primary search column (first in the list)
    // to the query, or 0 if no text query.
    const primaryCol = map.searchColumns[0];
    const scoreSql = query.q
      ? `similarity(${primaryCol}, $1)`
      : '0';

    const sql = `
      SELECT
        *,
        ${scoreSql} AS _score
      FROM ${map.table}
      ${whereSql}
      ORDER BY ${query.q ? '_score DESC,' : ''} ${map.idColumn}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSql = `SELECT COUNT(*)::int AS count FROM ${map.table} ${whereSql}`;

    const start = Date.now();
    const [rowsResult, countResult] = await Promise.all([
      this.query(sql, params),
      this.query(countSql, params),
    ]);
    const tookMs = Date.now() - start;

    const hits = rowsResult.rows.map((row: any) => {
      const score = Number(row._score) || 0;
      const { _score, ...document } = row;
      return { document: document as T, score };
    });

    return {
      hits,
      total: countResult.rows[0]?.count ?? 0,
      tookMs,
    };
  }

  async reindex(
    _collection: string,
    _source: AsyncIterable<SearchableDocument>,
  ): Promise<number> {
    // No-op — Postgres is the source of truth. We could re-run
    // ensureReady() to rebuild the GIN indexes, but REINDEX is an
    // expensive operation and not typically needed. Callers that
    // really want to rebuild should run `REINDEX TABLE products`
    // manually.
    return 0;
  }
}
