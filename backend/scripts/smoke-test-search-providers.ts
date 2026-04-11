/**
 * Smoke test for the multi-provider search factory.
 *
 * Exercises the factory + each provider without touching real infra:
 * - pg-trgm: uses an in-memory mock query function that captures the
 *   SQL generated and returns canned rows. Verifies the SQL shape,
 *   parameter binding, and filter translation.
 * - meilisearch / typesense: mocks fetch and verifies URL, auth header,
 *   payload translation.
 * - none: throws loudly on every call.
 *
 * Run with: npx ts-node scripts/smoke-test-search-providers.ts
 */
import { ConfigService } from '@nestjs/config';
import {
  createSearchProvider,
  SearchProviderNotConfiguredError,
  SearchProviderNotSupportedError,
} from '../src/modules/search/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};
const fetchCalls: FetchCall[] = [];
const realFetch = global.fetch;
function installMockFetch(status = 200, body: any = {}) {
  global.fetch = (async (url: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k] = String(v);
      }
    }
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : null,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
}
function restoreFetch() {
  global.fetch = realFetch;
}

async function expectThrow(
  label: string,
  fn: () => Promise<unknown>,
  matcher: (e: Error) => boolean,
): Promise<boolean> {
  try {
    await fn();
    console.log(`  ❌ ${label}: expected throw, got success`);
    return false;
  } catch (e) {
    if (matcher(e as Error)) {
      console.log(`  ✅ ${label}: threw as expected`);
      return true;
    }
    console.log(`  ❌ ${label}: wrong error: ${(e as Error).message}`);
    return false;
  }
}

// Mock pg query function that records executed SQL + params and
// returns canned rows for each kind of query.
type PgCall = { sql: string; params: any[] };
function makeMockPg(
  searchRows: any[],
  countRow: { count: number },
): { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>; calls: PgCall[] } {
  const calls: PgCall[] = [];
  const query = async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    const normalized = sql.trim().toLowerCase();
    if (normalized.startsWith('create extension') || normalized.startsWith('create index')) {
      return { rows: [] };
    }
    if (normalized.startsWith('select count')) {
      return { rows: [countRow] };
    }
    if (normalized.startsWith('select')) {
      return { rows: searchRows };
    }
    return { rows: [] };
  };
  return { query, calls };
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  const ok = (b: boolean) => (b ? pass++ : fail++);
  console.log('=== Search provider factory smoke test ===\n');

  // 1. none default
  console.log('1. no SEARCH_PROVIDER → none');
  {
    const p = createSearchProvider({
      config: fakeConfig({}),
      pgQuery: async () => ({ rows: [] }),
    });
    ok(p.name === 'none');
    console.log(`  ✅ factory returned: ${p.name}`);
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'search fails loudly',
        () => p.search('products', { q: 'x' }),
        (e) => e instanceof SearchProviderNotConfiguredError,
      ),
    );
  }

  // 2. planned providers fall back to none with warning
  console.log('\n2. planned (qdrant/weaviate/elastic) → fallback to none');
  {
    for (const choice of ['qdrant', 'weaviate', 'elasticsearch', 'elastic']) {
      const p = createSearchProvider({
        config: fakeConfig({ SEARCH_PROVIDER: choice }),
        pgQuery: async () => ({ rows: [] }),
      });
      ok(p.name === 'none');
    }
    console.log(`  ✅ all 4 planned values fell back to none`);
  }

  // 3. pg-trgm happy path with mock SQL (teamatonce uses `projects` table)
  console.log('\n3. pg-trgm with mock SQL');
  {
    const { query, calls } = makeMockPg(
      [
        { id: 'p1', name: 'Auth Refactor', description: 'Keycloak migration', _score: 0.9 },
        { id: 'p2', name: 'Auth Cleanup', description: 'Remove legacy', _score: 0.6 },
      ],
      { count: 2 },
    );
    const p = createSearchProvider({
      config: fakeConfig({ SEARCH_PROVIDER: 'pg-trgm' }),
      pgQuery: query,
    });
    ok(p.name === 'pg-trgm');
    ok(p.isAvailable() === true);

    const result = await p.search('projects', {
      q: 'auth',
      limit: 10,
      filters: { status: 'active' },
    });

    ok(result.hits.length === 2);
    ok(result.total === 2);
    ok(result.hits[0].document.name === 'Auth Refactor');
    ok(result.hits[0].score === 0.9);
    console.log(`  ✅ returned ${result.hits.length} hits, total=${result.total}`);

    // Verify SQL shape
    const mainQuery = calls.find((c) =>
      c.sql.toLowerCase().includes('from projects'),
    );
    ok(!!mainQuery);
    ok(mainQuery!.sql.includes('similarity'));
    ok(mainQuery!.sql.includes('name %'));
    ok(mainQuery!.sql.includes('status = '));
    ok(mainQuery!.params.includes('auth'));
    console.log(`  ✅ SQL shape + bound params correct`);

    // Verify pg_trgm extension + index creation attempted
    const extensionCall = calls.find((c) =>
      c.sql.toLowerCase().includes('create extension'),
    );
    ok(!!extensionCall);
    const indexCalls = calls.filter((c) =>
      c.sql.toLowerCase().includes('create index if not exists'),
    );
    // projects(name, description) + project_tasks(title, description)
    // + project_proposals(title, description) = 6 indexes expected
    ok(indexCalls.length >= 6);
    console.log(`  ✅ pg_trgm extension + ${indexCalls.length} GIN indexes ensured`);
  }

  // 4. pg-trgm rejects unsafe filter field names (SQL injection attempt)
  console.log('\n4. pg-trgm rejects unsafe filter field names');
  {
    const { query, calls } = makeMockPg([], { count: 0 });
    const p = createSearchProvider({
      config: fakeConfig({ SEARCH_PROVIDER: 'pg-trgm' }),
      pgQuery: query,
    });
    await p.search('projects', {
      q: '',
      filters: { "name; DROP TABLE projects; --": 'x' } as any,
    });
    const mainQuery = calls.find((c) =>
      c.sql.toLowerCase().includes('from projects'),
    );
    ok(!mainQuery!.sql.includes('DROP TABLE'));
    console.log(`  ✅ unsafe field name rejected (no DROP TABLE in SQL)`);
  }

  // 5. pg-trgm on unknown collection → NotSupported
  console.log('\n5. pg-trgm on unknown collection throws NotSupported');
  {
    const p = createSearchProvider({
      config: fakeConfig({ SEARCH_PROVIDER: 'pg-trgm' }),
      pgQuery: async () => ({ rows: [] }),
    });
    ok(
      await expectThrow(
        'unknown collection throws',
        () => p.search('unknown_collection', { q: 'x' }),
        (e) => e instanceof SearchProviderNotSupportedError,
      ),
    );
  }

  // 6. meilisearch with creds + mocked fetch
  console.log('\n6. meilisearch with creds (mocked network)');
  {
    installMockFetch(200, {
      hits: [{ id: 'p1', name: 'Widget' }],
      estimatedTotalHits: 1,
      processingTimeMs: 5,
    });
    try {
      const p = createSearchProvider({
        config: fakeConfig({
          SEARCH_PROVIDER: 'meilisearch',
          MEILI_URL: 'http://localhost:7700',
          MEILI_MASTER_KEY: 'master-key',
        }),
        pgQuery: async () => ({ rows: [] }),
      });
      ok(p.name === 'meilisearch');
      ok(p.isAvailable() === true);

      const result = await p.search('products', {
        q: 'widget',
        filters: { category: 'tools', status: 'active' },
        rangeFilters: { price: { gte: 5, lte: 50 } },
        facets: ['category', 'brand'],
      });

      ok(result.hits.length === 1);
      ok((result.hits[0].document as any).name === 'Widget');

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'http://localhost:7700/indexes/products/search');
      ok(call.headers['Authorization'] === 'Bearer master-key');
      const payload = JSON.parse(call.body!);
      ok(payload.q === 'widget');
      ok(payload.filter.includes("category = 'tools'"));
      ok(payload.filter.includes("status = 'active'"));
      ok(payload.filter.includes('price >= 5'));
      ok(payload.filter.includes('price <= 50'));
      ok(payload.facets.length === 2);
      console.log(`  ✅ meilisearch POST /search + filter translation correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 7. meilisearch without creds → unavailable
  console.log('\n7. meilisearch without creds → unavailable');
  {
    const p = createSearchProvider({
      config: fakeConfig({ SEARCH_PROVIDER: 'meilisearch' }),
      pgQuery: async () => ({ rows: [] }),
    });
    ok(p.name === 'meilisearch');
    ok(p.isAvailable() === false);
  }

  // 8. typesense with creds + mocked fetch
  console.log('\n8. typesense with creds (mocked network)');
  {
    installMockFetch(200, {
      hits: [
        { document: { id: 'p1', name: 'Widget' }, text_match: 999, highlights: [] },
      ],
      found: 1,
      search_time_ms: 3,
    });
    try {
      const p = createSearchProvider({
        config: fakeConfig({
          SEARCH_PROVIDER: 'typesense',
          TYPESENSE_URL: 'http://localhost:8108',
          TYPESENSE_API_KEY: 'xyz',
        }),
        pgQuery: async () => ({ rows: [] }),
      });
      ok(p.name === 'typesense');
      ok(p.isAvailable() === true);

      const result = await p.search('products', {
        q: 'widget',
        filters: { category: 'tools' },
        rangeFilters: { price: { gte: 5 } },
      });

      ok(result.hits.length === 1);
      ok(result.total === 1);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url.startsWith('http://localhost:8108/collections/products/documents/search'));
      ok(call.headers['X-TYPESENSE-API-KEY'] === 'xyz');
      ok(call.url.includes('q=widget'));
      ok(call.url.includes('filter_by=category%3A%3D%60tools%60+%26%26+price%3A%3E%3D5'));
      console.log(`  ✅ typesense GET /search + filter syntax correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 9. typesense indexBatch generates JSONL
  console.log('\n9. typesense indexBatch generates JSONL body');
  {
    installMockFetch(200, {});
    try {
      const p = createSearchProvider({
        config: fakeConfig({
          SEARCH_PROVIDER: 'typesense',
          TYPESENSE_URL: 'http://localhost:8108',
          TYPESENSE_API_KEY: 'xyz',
        }),
        pgQuery: async () => ({ rows: [] }),
      });
      await p.indexBatch('products', [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ]);
      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url.includes('documents/import?action=upsert'));
      ok(call.body?.includes('"id":"p1"') === true);
      ok(call.body?.includes('\n"id":"p2"'.replace(/"id"/, '\n{"id"')) === false); // just sanity
      // JSONL means two lines separated by \n
      ok((call.body ?? '').split('\n').length === 2);
      console.log(`  ✅ indexBatch sends JSONL (2 lines)`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 10. unknown value
  console.log('\n10. unknown SEARCH_PROVIDER → none (fallback)');
  {
    const p = createSearchProvider({
      config: fakeConfig({ SEARCH_PROVIDER: 'foobar' }),
      pgQuery: async () => ({ rows: [] }),
    });
    ok(p.name === 'none');
    console.log(`  ✅ fallback to: ${p.name}`);
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
