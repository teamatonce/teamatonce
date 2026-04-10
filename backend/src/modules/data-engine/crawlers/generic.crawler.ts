import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { CrawledDataService } from '../services/crawled-data.service';

export interface GenericCrawlOptions {
  urls: string[];
  mode?: 'single' | 'listing' | 'batch';
  contentType?: 'job_post' | 'profile' | 'company' | 'auto';
  fetchMethod?: 'cheerio' | 'puppeteer';
  limit?: number;
  customPrompt?: string;
  page?: number;
  autoPaginate?: boolean;
  maxPages?: number;
}

export interface GenericCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  itemsFailed: number;
  pagesScanned: number;
  lastPage: number;
  errorMessage?: string;
}

@Injectable()
export class GenericCrawler {
  private readonly logger = new Logger(GenericCrawler.name);
  private readonly limiter: Bottleneck;
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    const delayMs = this.configService.get<number>('CRAWLER_GENERIC_DELAY_MS') || 1000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });

    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Crawl URLs using AI extraction.
   *
   * In **listing** mode with autoPaginate (default), appends ?page=N to the
   * listing URL and keeps discovering + processing detail links across pages
   * until `limit` NEW items are stored, or `maxPages` listing pages scanned.
   *
   * In single/batch mode pagination is not applicable.
   */
  async crawl(options: GenericCrawlOptions): Promise<GenericCrawlResult> {
    const mode = options.mode || 'single';
    const contentType = options.contentType || 'auto';
    const fetchMethod = options.fetchMethod || 'cheerio';
    const limit = options.limit || 20;
    const startPage = options.page || 1;
    const autoPaginate = options.autoPaginate ?? true;
    const maxPages = options.maxPages || 5;

    const job = await this.crawledDataService.createJob('generic', {
      urls: options.urls,
      mode,
      contentType,
      fetchMethod,
      limit,
      page: startPage,
      autoPaginate,
      maxPages,
    });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(
        `Starting generic crawl — Mode: ${mode}, URLs: ${options.urls.length}, ` +
        `ContentType: ${contentType}, FetchMethod: ${fetchMethod}, Limit: ${limit}`,
      );

      let totalFound = 0;
      let totalNew = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let pagesScanned = 0;
      let currentPage = startPage;

      // Reuse browser instance for puppeteer
      let browser: any = null;
      if (fetchMethod === 'puppeteer') {
        browser = await this.launchBrowser();
      }

      try {
        if (mode === 'listing') {
          // Paginated listing mode — discover links from successive listing pages
          const pageLimit = autoPaginate ? maxPages : 1;
          const seenUrls = new Set<string>();

          while (pagesScanned < pageLimit && totalNew < limit) {
            // Build paginated listing URL
            const baseListingUrl = options.urls[0];
            const listingUrl = this.buildPaginatedUrl(baseListingUrl, currentPage);

            this.logger.log(`Listing page ${currentPage} (${pagesScanned + 1}/${pageLimit}): ${listingUrl}`);

            const listingHtml = browser
              ? await this.fetchPageWithBrowser(browser, listingUrl)
              : await this.fetchPage(listingUrl, fetchMethod);

            const discoveredUrls = await this.discoverLinks(listingHtml, baseListingUrl);
            // Filter out already-seen URLs from previous pages
            const newUrls = discoveredUrls.filter(u => !seenUrls.has(u));
            newUrls.forEach(u => seenUrls.add(u));

            if (newUrls.length === 0) {
              this.logger.log(`Listing page ${currentPage} discovered 0 new links — no more pages.`);
              break;
            }

            this.logger.log(`Listing page ${currentPage}: discovered ${newUrls.length} new links`);
            totalFound += newUrls.length;

            // Process discovered detail pages
            for (const url of newUrls) {
              if (totalNew >= limit) break;

              const result = await this.processUrl(url, contentType, fetchMethod, browser, options.customPrompt);
              if (result === 'new') totalNew++;
              else if (result === 'skipped') totalSkipped++;
              else totalFailed++;
            }

            pagesScanned++;
            currentPage++;
          }
        } else {
          // Single / batch mode — no pagination
          const urlsToProcess = mode === 'batch' ? options.urls : [options.urls[0]];
          totalFound = urlsToProcess.length;
          pagesScanned = 1;

          for (const url of urlsToProcess) {
            if (totalNew >= limit) break;

            const result = await this.processUrl(url, contentType, fetchMethod, browser, options.customPrompt);
            if (result === 'new') totalNew++;
            else if (result === 'skipped') totalSkipped++;
            else totalFailed++;
          }
        }
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch {
            // ignore close errors
          }
        }
      }

      await this.crawledDataService.updateJob(job.id, {
        status: 'completed',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsSkipped: totalSkipped,
        completedAt: new Date(),
      });

      this.logger.log(
        `Generic crawl completed. Pages: ${pagesScanned}, Found: ${totalFound}, ` +
        `New: ${totalNew}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`,
      );

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsSkipped: totalSkipped,
        itemsFailed: totalFailed,
        pagesScanned,
        lastPage: currentPage - 1,
      };
    } catch (error) {
      this.logger.error(`Generic crawl failed: ${error.message}`);

      await this.crawledDataService.updateJob(job.id, {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
      });

      return {
        jobId: job.id,
        status: 'failed',
        itemsFound: 0,
        itemsNew: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
        pagesScanned: 0,
        lastPage: 0,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Process a single URL: dedup check → fetch → clean → store raw content.
   * All AI processing is deferred to the enrichment service (single-pass).
   * Returns 'new', 'skipped', or 'failed'.
   */
  private async processUrl(
    url: string,
    contentType: string,
    fetchMethod: string,
    browser: any | null,
    customPrompt?: string,
  ): Promise<'new' | 'skipped' | 'failed'> {
    try {
      const exists = await this.crawledDataService.existsBySourceUrl(url);
      if (exists) return 'skipped';

      const html = browser
        ? await this.fetchPageWithBrowser(browser, url)
        : await this.fetchPage(url, fetchMethod);

      const cleaned = this.cleanHtml(html);

      const parsedUrl = new URL(url);
      const sourceId = parsedUrl.hostname + '-' + createHash('md5').update(parsedUrl.pathname + parsedUrl.search).digest('hex').slice(0, 12);

      await this.crawledDataService.create({
        source: 'generic',
        type: contentType === 'auto' ? 'job_post' : contentType,
        sourceUrl: url,
        sourceId,
        rawData: {
          _rawContent: true,
          _contentType: contentType,
          _sourceUrl: url,
          _title: cleaned.title,
          _metaDescription: cleaned.metaDescription,
          ...(customPrompt ? { _customPrompt: customPrompt } : {}),
          text: cleaned.text,
        },
        crawledAt: new Date(),
      });

      return 'new';
    } catch (error) {
      this.logger.error(`Failed to process URL ${url}: ${error.message}`);
      return 'failed';
    }
  }

  /**
   * Build a paginated version of a listing URL by appending/updating the page param.
   */
  private buildPaginatedUrl(baseUrl: string, page: number): string {
    if (page <= 1) return baseUrl;

    try {
      const url = new URL(baseUrl);
      url.searchParams.set('page', String(page));
      return url.toString();
    } catch {
      // If URL parsing fails, append naively
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}page=${page}`;
    }
  }

  private async fetchPage(url: string, method: string): Promise<string> {
    if (method === 'puppeteer') {
      let browser: any = null;
      try {
        browser = await this.launchBrowser();
        return await this.fetchPageWithBrowser(browser, url);
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch {
            // ignore
          }
        }
      }
    }

    // Default: cheerio (static fetch)
    const response = await this.limiter.schedule(() =>
      fetch(url, {
        headers: {
          'User-Agent': 'Team@Once Bot/1.0 (Data Collection for Talent Matching)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30000),
      }),
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  private async launchBrowser(): Promise<any> {
    try {
      const puppeteer = await import('puppeteer-extra');
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
      puppeteer.default.use(StealthPlugin.default());
      return puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch {
      // Fall back to regular puppeteer if puppeteer-extra not available
      const puppeteer = await import('puppeteer');
      return puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  private async fetchPageWithBrowser(browser: any, url: string): Promise<string> {
    const page = await browser.newPage();
    try {
      await page.setUserAgent('Team@Once Bot/1.0 (Data Collection for Talent Matching)');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      return await page.content();
    } finally {
      await page.close();
    }
  }

  private cleanHtml(html: string): { text: string; title: string; metaDescription: string } {
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, header, iframe, noscript, svg, [role="navigation"]').remove();

    const title = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';

    // Get body text, collapse whitespace
    let bodyText = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to ~12,000 chars (single AI call can afford more context)
    if (bodyText.length > 12000) {
      bodyText = bodyText.slice(0, 12000) + '...';
    }

    return { text: bodyText, title, metaDescription };
  }

  private async discoverLinks(html: string, baseUrl: string): Promise<string[]> {
    const $ = cheerio.load(html);
    const links: { url: string; text: string }[] = [];
    const base = new URL(baseUrl);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).toString();
        const text = $(el).text().trim().slice(0, 100);
        // Only include links from same domain or subdomains
        const linkHost = new URL(resolved).hostname;
        if (linkHost === base.hostname || linkHost.endsWith('.' + base.hostname)) {
          links.push({ url: resolved, text });
        }
      } catch {
        // skip invalid URLs
      }
    });

    // Deduplicate and strip fragment-only variants (e.g., /companies/foo vs /companies/foo#marker)
    const uniqueLinks = Array.from(
      new Map(
        links.map((l) => {
          const noHash = l.url.split('#')[0];
          return [noHash, { url: noHash, text: l.text }];
        }),
      ).values(),
    );

    this.logger.log(`discoverLinks: ${links.length} raw links → ${uniqueLinks.length} unique (deduped + stripped fragments)`);

    // Send to AI to filter to detail-page links only
    const capped = uniqueLinks.slice(0, 200);
    const linkList = capped
      .map((l, i) => `${i}: ${l.url} | ${l.text}`)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a link classifier. Given a list of links from a listing/index page, identify which links point to individual detail pages (e.g., job posts, profiles, company pages) vs navigation/utility links.
Return JSON: { "detailLinks": [0, 3, 5, ...] } where values are the indices of detail page links.
IMPORTANT: Only return the indices array. Keep it compact — no spaces after commas.`,
          },
          {
            role: 'user',
            content: `Base URL: ${baseUrl}\n\nLinks:\n${linkList}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = response.choices[0].message.content || '{"detailLinks":[]}';
      const result = JSON.parse(content);
      const indices: number[] = result.detailLinks || [];

      this.logger.log(`discoverLinks: AI identified ${indices.length} detail links out of ${capped.length}`);

      return indices
        .filter((i) => i >= 0 && i < capped.length)
        .map((i) => capped[i].url);
    } catch (error) {
      this.logger.warn(`discoverLinks AI filtering failed: ${error.message}. Falling back to URL-pattern matching.`);

      // Fallback: use URL pattern heuristics — detail pages typically have a slug after the base path
      const basePath = new URL(baseUrl).pathname.replace(/\/$/, '');
      return capped
        .filter((l) => {
          const path = new URL(l.url).pathname;
          // Detail page = one level deeper than base, not a hash/anchor, not an asset
          return (
            path.startsWith(basePath + '/') &&
            path !== basePath + '/' &&
            !path.match(/\.(css|js|png|jpg|svg|ico|woff)$/) &&
            path.split('/').length <= basePath.split('/').length + 2
          );
        })
        .map((l) => l.url);
    }
  }
}
