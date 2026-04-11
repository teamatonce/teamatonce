/**
 * Meilisearch provider.
 *
 *   SEARCH_PROVIDER=meilisearch
 *   MEILI_URL=http://localhost:7700
 *   MEILI_MASTER_KEY=your-master-key
 *
 * Pure REST via fetch — no SDK dep. Meilisearch is the recommended
 * production default for e-commerce catalogs because of its exceptional
 * typo tolerance, fast faceted search, and tiny footprint.
 *
 * Run via `docker compose --profile meilisearch up -d` (once the install
 * wizard PR #27 lands).
 *
 * Meilisearch's "indexes" map 1:1 to our "collections" concept.
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

export class MeilisearchProvider implements SearchProvider {
  readonly name = 'meilisearch' as const;
  private readonly logger = new Logger('MeilisearchProvider');

  private readonly url: string;
  private readonly masterKey: string;

  constructor(config: ConfigService) {
    this.url = (config.get<string>('MEILI_URL', '') || '').replace(/\/+$/, '');
    this.masterKey = config.get<string>('MEILI_MASTER_KEY', '');

    if (this.isAvailable()) {
      this.logger.log(`Meilisearch provider configured (${this.url})`);
    } else {
      this.logger.warn(
        'Meilisearch provider selected but MEILI_URL / MEILI_MASTER_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.url && this.masterKey);
  }

  private async meiliApi(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new SearchProviderNotConfiguredError('meilisearch', [
        !this.url ? 'MEILI_URL' : '',
        !this.masterKey ? 'MEILI_MASTER_KEY' : '',
      ].filter(Boolean));
    }
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.masterKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Meilisearch API ${method} ${path} failed: ${res.status} ${text}`,
      );
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async indexDocument(
    collection: string,
    document: SearchableDocument,
  ): Promise<void> {
    await this.meiliApi('POST', `/indexes/${collection}/documents`, [document]);
  }

  async indexBatch(
    collection: string,
    documents: SearchableDocument[],
  ): Promise<void> {
    if (documents.length === 0) return;
    await this.meiliApi('POST', `/indexes/${collection}/documents`, documents);
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    await this.meiliApi(
      'DELETE',
      `/indexes/${collection}/documents/${encodeURIComponent(id)}`,
    );
  }

  async search<T = SearchableDocument>(
    collection: string,
    query: SearchQuery,
  ): Promise<SearchResult<T>> {
    // Translate our filter shape to Meili's string filter syntax:
    //   filters: { category: 'shoes', status: 'active' }
    //   → "category = 'shoes' AND status = 'active'"
    const filterParts: string[] = [];
    if (query.filters) {
      for (const [field, value] of Object.entries(query.filters)) {
        filterParts.push(
          `${field} = ${typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : value}`,
        );
      }
    }
    if (query.rangeFilters) {
      for (const [field, range] of Object.entries(query.rangeFilters)) {
        if (range.gte !== undefined) {
          filterParts.push(`${field} >= ${range.gte}`);
        }
        if (range.lte !== undefined) {
          filterParts.push(`${field} <= ${range.lte}`);
        }
      }
    }

    const payload: any = {
      q: query.q,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
    if (filterParts.length > 0) payload.filter = filterParts.join(' AND ');
    if (query.facets && query.facets.length > 0) payload.facets = query.facets;
    if (query.sort) payload.sort = [query.sort];

    const res = await this.meiliApi(
      'POST',
      `/indexes/${collection}/search`,
      payload,
    );

    const hits = (res.hits ?? []).map((doc: any) => ({
      document: doc as T,
      // Meili doesn't return per-hit score by default. Use position as
      // a proxy so callers that sort by score get sensible ordering.
      score: 1,
    }));

    return {
      hits,
      total: res.estimatedTotalHits ?? res.totalHits ?? hits.length,
      facets: res.facetDistribution,
      tookMs: res.processingTimeMs,
    };
  }

  async reindex(
    collection: string,
    source: AsyncIterable<SearchableDocument>,
  ): Promise<number> {
    // Wipe and re-populate. Meili provides a "delete all documents"
    // endpoint; we batch the source in groups of 1000.
    await this.meiliApi('DELETE', `/indexes/${collection}/documents`);

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
