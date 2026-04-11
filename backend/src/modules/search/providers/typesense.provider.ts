/**
 * Typesense provider.
 *
 *   SEARCH_PROVIDER=typesense
 *   TYPESENSE_URL=http://localhost:8108
 *   TYPESENSE_API_KEY=your-api-key
 *
 * Pure REST via fetch. Typesense is a fast, simple, self-hosted
 * alternative to Meilisearch with a similar feature set. Run via
 * `docker compose --profile typesense up -d` (install PR #27).
 *
 * Typesense's "collections" map 1:1 to our "collections" concept.
 *
 * NOTE: Typesense requires an explicit schema for each collection,
 * with typed fields and a designated `id` field. This provider assumes
 * the caller has already created the collection via
 * `POST /collections` with an appropriate schema before indexing.
 * The `reindex()` method will create a minimal schema if none exists.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SearchableDocument,
  SearchProvider,
  SearchProviderNotConfiguredError,
  SearchQuery,
  SearchResult,
} from './search-provider.interface';

export class TypesenseProvider implements SearchProvider {
  readonly name = 'typesense' as const;
  private readonly logger = new Logger('TypesenseProvider');

  private readonly url: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.url = (config.get<string>('TYPESENSE_URL', '') || '').replace(
      /\/+$/,
      '',
    );
    this.apiKey = config.get<string>('TYPESENSE_API_KEY', '');

    if (this.isAvailable()) {
      this.logger.log(`Typesense provider configured (${this.url})`);
    } else {
      this.logger.warn(
        'Typesense provider selected but TYPESENSE_URL / TYPESENSE_API_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.url && this.apiKey);
  }

  private async typesenseApi(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: any,
    contentType = 'application/json',
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new SearchProviderNotConfiguredError('typesense', [
        !this.url ? 'TYPESENSE_URL' : '',
        !this.apiKey ? 'TYPESENSE_API_KEY' : '',
      ].filter(Boolean));
    }
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        'X-TYPESENSE-API-KEY': this.apiKey,
        'Content-Type': contentType,
      },
      body:
        body === undefined
          ? undefined
          : contentType === 'application/json'
            ? JSON.stringify(body)
            : body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Typesense API ${method} ${path} failed: ${res.status} ${text}`,
      );
    }
    if (res.status === 204) return null;
    // Typesense's /documents/import returns JSONL, not JSON.
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return res.text();
    return res.json();
  }

  async indexDocument(
    collection: string,
    document: SearchableDocument,
  ): Promise<void> {
    // Typesense expects `id` as a string field. Normalize.
    const doc = { ...document, id: String(document.id) };
    await this.typesenseApi(
      'POST',
      `/collections/${collection}/documents?action=upsert`,
      doc,
    );
  }

  async indexBatch(
    collection: string,
    documents: SearchableDocument[],
  ): Promise<void> {
    if (documents.length === 0) return;
    // Typesense /documents/import expects JSONL with action=upsert.
    const jsonl = documents
      .map((d) => JSON.stringify({ ...d, id: String(d.id) }))
      .join('\n');
    await this.typesenseApi(
      'POST',
      `/collections/${collection}/documents/import?action=upsert`,
      jsonl,
      'text/plain',
    );
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    await this.typesenseApi(
      'DELETE',
      `/collections/${collection}/documents/${encodeURIComponent(id)}`,
    );
  }

  async search<T = SearchableDocument>(
    collection: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>> {
    // Typesense's filter syntax is very similar to Meili's:
    //   "category:=shoes && status:=active"
    const filterParts: string[] = [];
    if (query.filters) {
      for (const [field, value] of Object.entries(query.filters)) {
        filterParts.push(
          `${field}:=${typeof value === 'string' ? `\`${value}\`` : value}`,
        );
      }
    }
    if (query.rangeFilters) {
      for (const [field, range] of Object.entries(query.rangeFilters)) {
        if (range.gte !== undefined) filterParts.push(`${field}:>=${range.gte}`);
        if (range.lte !== undefined) filterParts.push(`${field}:<=${range.lte}`);
      }
    }

    const params = new URLSearchParams();
    params.set('q', query.q || '*');
    // Default to searching all text fields; callers can override via
    // the future `searchFields` knob.
    params.set('query_by', 'name,description');
    if (filterParts.length > 0) {
      params.set('filter_by', filterParts.join(' && '));
    }
    if (query.facets && query.facets.length > 0) {
      params.set('facet_by', query.facets.join(','));
    }
    if (query.sort) params.set('sort_by', query.sort);
    params.set('per_page', String(query.limit ?? 20));
    params.set('page', String(Math.floor((query.offset ?? 0) / (query.limit ?? 20)) + 1));

    const res = await this.typesenseApi(
      'GET',
      `/collections/${collection}/documents/search?${params.toString()}`,
    );

    const hits = (res.hits ?? []).map((h: any) => ({
      document: h.document as T,
      score: h.text_match ?? 1,
      highlights: h.highlights
        ? Object.fromEntries(
            h.highlights.map((hi: any) => [hi.field, hi.snippets ?? []]),
          )
        : undefined,
    }));

    const facets: Record<string, Record<string, number>> = {};
    for (const fc of res.facet_counts ?? []) {
      facets[fc.field_name] = Object.fromEntries(
        (fc.counts ?? []).map((c: any) => [c.value, c.count]),
      );
    }

    return {
      hits,
      total: res.found ?? hits.length,
      facets: Object.keys(facets).length > 0 ? facets : undefined,
      tookMs: res.search_time_ms,
    };
  }

  async reindex(
    collection: string,
    source: AsyncIterable<SearchableDocument>,
  ): Promise<number> {
    // Typesense has no "delete all" endpoint — we delete the collection
    // and recreate it with a minimal schema, then import. If the caller
    // already created a proper schema, they should call indexBatch()
    // themselves instead of reindex().
    try {
      await this.typesenseApi('DELETE', `/collections/${collection}`);
    } catch {
      // 404 is fine.
    }
    await this.typesenseApi('POST', '/collections', {
      name: collection,
      fields: [
        { name: 'id', type: 'string' },
        { name: '.*', type: 'auto' }, // allow any additional fields
      ],
    });

    let count = 0;
    let batch: SearchableDocument[] = [];
    for await (const doc of source) {
      batch.push(doc);
      if (batch.length >= 1000) {
        await this.indexBatch(collection, batch);
        count += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      await this.indexBatch(collection, batch);
      count += batch.length;
    }
    return count;
  }
}
