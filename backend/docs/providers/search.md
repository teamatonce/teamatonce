# Search providers

Vasty Shop supports pluggable product/catalog search. Pick a provider
by setting `SEARCH_PROVIDER` in your `.env`.

```
SEARCH_PROVIDER=pg-trgm   # zero-infra default
```

## Comparison

| Provider | Free tier | Infra | Indexing | Typo tolerance | Facets | Best for |
|---|---|---|---|---|---|---|
| **pg-trgm** *(default)* | ♾️ | none (uses existing Postgres) | no-op (Postgres is source of truth) | good (trigram) | no | dev + small prod |
| **meilisearch** | ♾️ self-hosted | docker | batch upsert | excellent | ✅ | recommended for prod e-commerce |
| **typesense** | ♾️ self-hosted | docker | JSONL import | excellent | ✅ | simpler schema than Meilisearch |
| **qdrant** | ♾️ self-hosted | docker | [planned #22] | — | ✅ (via payload) | semantic/vector |
| **weaviate** | ♾️ self-hosted | docker | [planned #22] | — | ✅ | hybrid keyword + vector |
| **elasticsearch** | ♾️ self-hosted | docker | [planned #22] | ✅ | ✅ | enterprise stack |
| **none** | — | — | — | — | — | default — search disabled |

## Which should I pick?

- **"I just want product search to work"** → `pg-trgm` (zero infra,
  works against existing Postgres, no separate index to maintain)
- **Production e-commerce with typo tolerance and faceting** →
  `meilisearch` (exceptional UX out of the box)
- **Alternative to Meilisearch with simpler schema config** →
  `typesense`
- **Semantic search / "find products similar to X"** → `qdrant`
  *(coming in follow-up PR)*
- **Existing Elasticsearch / OpenSearch cluster** →
  `elasticsearch` *(coming in follow-up PR)*

## Per-provider setup

### pg-trgm (default)

No setup beyond what you already have. On first search, the provider:

1. Runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` (idempotent)
2. Creates GIN indexes on `products(name)`, `products(description)`,
   `products(short_description)` for fast trigram similarity lookup
3. Searches use `col % $query` (trigram match) OR `col ILIKE '%query%'`
   (substring match), scored by `similarity(name, $query)`

```
SEARCH_PROVIDER=pg-trgm
```

**Permissions**: if the app's Postgres user doesn't have
`CREATE EXTENSION` privilege, the provider logs a warning once and
falls back to plain `ILIKE`. Run this as a superuser to enable the
fast path:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Indexing**: no-op. The moment a row exists in `products`, it's
searchable. No separate reindex step on schema changes.

**Not suitable for**: semantic/vector search, faceted search on
arbitrary fields. Graduate to Meilisearch / Typesense / Qdrant when
you need those.

**Security**: filter field names are matched against
`^[a-zA-Z_][a-zA-Z0-9_]*$` before being interpolated into SQL.
Attempts to inject via `{"name; DROP TABLE...": 1}` are logged and
dropped. Values are always bound via pg parameters.

### meilisearch

Run via `docker compose --profile meilisearch up -d` (once install
PR #27 lands) or any `getmeili/meilisearch` image.

```
SEARCH_PROVIDER=meilisearch
MEILI_URL=http://localhost:7700
MEILI_MASTER_KEY=your-master-key
```

Meilisearch "indexes" map 1:1 to our "collections" concept. The
provider translates our filter shape to Meili's string filter syntax:

```js
{ category: 'shoes', status: 'active' }
// → "category = 'shoes' AND status = 'active'"

{ price: { gte: 10, lte: 100 } }
// → "price >= 10 AND price <= 100"
```

**Faceting**: pass `facets: ['category', 'brand']` in the query;
Meilisearch returns counts in the response.

**Reindexing**: `reindex()` deletes all documents in the index and
re-uploads from the source iterator in batches of 1000.

### typesense

Run via `docker compose --profile typesense up -d` or any
`typesense/typesense` image.

```
SEARCH_PROVIDER=typesense
TYPESENSE_URL=http://localhost:8108
TYPESENSE_API_KEY=your-api-key
```

Typesense requires an explicit schema per collection. The provider's
default `reindex()` deletes the collection and recreates it with a
minimal `id: string, .*: auto` schema. For production, create the
collection yourself with properly typed fields (`price: float`,
`created_at: int64`, etc.) before calling `indexBatch()`.

**Filters**: translated to Typesense's `field:=value` syntax:

```js
{ category: 'shoes' }
// → "category:=`shoes`"

{ price: { gte: 10, lte: 100 } }
// → "price:>=10 && price:<=100"
```

Typesense uses backticks around string values to allow spaces.

### qdrant / weaviate / elasticsearch (planned)

These are listed in the factory as valid `SEARCH_PROVIDER` values but
currently log a warning and fall back to `none`. Follow-up PRs will
implement them, tracked under issue #22. Picking one now is a no-op
rather than a silent bug — you'll get a clear warning at startup.

### none (default if unset)

Every method throws `SearchProviderNotConfiguredError`. The startup
log prints which env var to set.

## Migration from the old ProductsService.search()

`ProductsService.search()` currently:
1. Calls `DatabaseService.unifiedSearch()` — a non-existent method
   that always throws
2. Falls back to `manualSearch()` which runs a plain `ILIKE '%q%'`
   query against the products table

A follow-up PR will migrate `ProductsService.search()` to inject
`SearchService` instead, removing the dead `unifiedSearch()` call.
The pg-trgm provider is a straight upgrade over the current manual
fallback: trigram similarity gives better relevance than raw ILIKE
and the GIN index makes it fast.

## Adding a new provider

1. Implement `SearchProvider` in
   `backend/src/modules/search/providers/<name>.provider.ts`
2. Add a case to `createSearchProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. Add smoke-test coverage in
   `backend/scripts/smoke-test-search-providers.ts`
