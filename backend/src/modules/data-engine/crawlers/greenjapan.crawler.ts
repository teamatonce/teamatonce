import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const GREENJAPAN_BASE_URL = 'https://www.green-japan.com';
const GREENJAPAN_SITEMAP_URL = `${GREENJAPAN_BASE_URL}/sitemap/jobs.xml`;

export interface GreenJapanCrawlOptions {
  limit?: number;
  maxUrls?: number;
  autoPaginate?: boolean;
}

export interface GreenJapanCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  urlsProcessed: number;
  errorMessage?: string;
}

@Injectable()
export class GreenJapanCrawler {
  private readonly logger = new Logger(GreenJapanCrawler.name);
  private readonly limiter: Bottleneck;
  private readonly userAgent: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    const delayMs = this.configService.get<number>('CRAWLER_GREENJAPAN_DELAY_MS') || 7000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });

    this.userAgent = this.configService.get<string>('CRAWLER_USER_AGENT') ||
      'Team@Once Bot/1.0 (Data Collection for Talent Matching; contact@teamatonce.com)';
  }

  /**
   * Crawl Green Japan job listings via sitemap + individual page scraping.
   *
   * 1. Fetches sitemap XML to discover job URLs
   * 2. Rate-limited fetching of individual job pages
   * 3. Cheerio-based extraction of job details
   */
  async crawlJobs(options: GreenJapanCrawlOptions = {}): Promise<GreenJapanCrawlResult> {
    const limit = options.limit || 30;
    const maxUrls = options.maxUrls || 100;

    const job = await this.crawledDataService.createJob('greenjapan', { limit, maxUrls });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting Green Japan crawl — Limit: ${limit}, MaxUrls: ${maxUrls}`);

      // Step 1: Fetch sitemap and extract job URLs
      const jobUrls = await this.fetchJobUrlsFromSitemap(maxUrls);
      this.logger.log(`Found ${jobUrls.length} job URLs from sitemap`);

      if (jobUrls.length === 0) {
        await this.crawledDataService.updateJob(job.id, {
          status: 'completed',
          itemsFound: 0,
          itemsNew: 0,
          itemsSkipped: 0,
          completedAt: new Date(),
        });

        return {
          jobId: job.id,
          status: 'completed',
          itemsFound: 0,
          itemsNew: 0,
          itemsSkipped: 0,
          urlsProcessed: 0,
        };
      }

      // Step 2: Process each URL
      let totalFound = 0;
      let totalNew = 0;
      let totalSkipped = 0;
      let urlsProcessed = 0;

      for (const url of jobUrls) {
        if (totalNew >= limit) break;

        urlsProcessed++;
        const sourceId = this.extractJobId(url);

        // Dedup check
        const exists = await this.crawledDataService.existsBySourceUrl(url)
          || await this.crawledDataService.existsBySourceId('greenjapan', sourceId);
        if (exists) {
          totalSkipped++;
          continue;
        }

        try {
          const jobData = await this.fetchAndParseJobPage(url);
          if (!jobData) {
            this.logger.debug(`Could not parse job page: ${url}`);
            continue;
          }

          totalFound++;

          const rawData = {
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            salary: jobData.salary,
            description: jobData.description,
            tags: jobData.tags,
            region: 'Japan',
            language: 'ja',
          };

          await this.crawledDataService.create({
            source: 'greenjapan',
            type: 'job_post',
            sourceUrl: url,
            sourceId,
            rawData,
            crawledAt: new Date(),
          });

          totalNew++;
          this.logger.debug(`Crawled Green Japan job: ${jobData.title} (${totalNew}/${limit} new)`);
        } catch (error) {
          this.logger.error(`Failed to process ${url}: ${error.message}`);
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
        `Green Japan crawl completed. URLs processed: ${urlsProcessed}, Found: ${totalFound}, ` +
        `New: ${totalNew}, Skipped: ${totalSkipped}`,
      );

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsSkipped: totalSkipped,
        urlsProcessed,
      };
    } catch (error) {
      this.logger.error(`Green Japan crawl failed: ${error.message}`);

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
        urlsProcessed: 0,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Fetch the jobs sitemap and extract job page URLs.
   * Matches URLs like /company/{id}/job/{id}
   */
  private async fetchJobUrlsFromSitemap(maxUrls: number): Promise<string[]> {
    const response = await fetch(GREENJAPAN_SITEMAP_URL, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/xml,text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Sitemap fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const urls: string[] = [];
    $('url > loc').each((_, el) => {
      if (urls.length >= maxUrls) return false;
      const loc = $(el).text().trim();
      // Match job page URLs: /company/{id}/job/{id}
      if (/\/company\/\d+\/job\/\d+/.test(loc)) {
        urls.push(loc);
      }
    });

    return urls;
  }

  /**
   * Fetch and parse a single job page with rate limiting.
   */
  private async fetchAndParseJobPage(url: string): Promise<{
    title: string;
    company: string;
    location: string;
    salary: string;
    description: string;
    tags: string[];
  } | null> {
    const response = await this.limiter.schedule(() =>
      fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
      }),
    );

    if (!response.ok) {
      throw new Error(`Page fetch failed (${response.status}): ${url}`);
    }

    const html = await response.text();
    return this.parseJobPage(html);
  }

  /**
   * Parse job details from a Green Japan job page HTML.
   * Uses semantic selectors with fallbacks since CSS class names may change.
   */
  private parseJobPage(html: string): {
    title: string;
    company: string;
    location: string;
    salary: string;
    description: string;
    tags: string[];
  } | null {
    const $ = cheerio.load(html);

    // Title: primary h1
    const title = $('h1').first().text().trim();
    if (!title) return null;

    // Company name: look for company-related elements
    const company = $('a[href*="/company/"] h2, a[href*="/company/"] span, [class*="company"] a, [class*="company-name"]')
      .first().text().trim()
      || $('a[href*="/company/"]').filter((_, el) => {
        const text = $(el).text().trim();
        return text.length > 0 && text.length < 100 && !text.includes('\n');
      }).first().text().trim()
      || '';

    // Location: text containing common Japanese location patterns
    let location = '';
    $('span, div, p, td').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 50 && (
        /[都道府県市区町村]/.test(text) ||
        /東京|大阪|名古屋|福岡|京都|横浜|札幌|神戸/.test(text)
      )) {
        location = text;
        return false;
      }
    });

    // Salary: look for 万円 pattern (Japanese salary format)
    let salary = '';
    $('span, div, p, td, dd').each((_, el) => {
      const text = $(el).text().trim();
      if (/\d+万円/.test(text) && text.length < 100) {
        salary = text;
        return false;
      }
    });

    // Description: main content area
    const description = $('[class*="description"], [class*="detail"], [class*="content"], article, .job-description')
      .first().text().trim().substring(0, 5000)
      || $('main, [role="main"]').first().text().trim().substring(0, 5000)
      || '';

    // Tags/technologies: look for tag-like elements
    const tags: string[] = [];
    $('[class*="tag"], [class*="skill"], [class*="label"], [class*="keyword"]').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag && tag.length > 0 && tag.length < 50 && !tags.includes(tag)) {
        tags.push(tag);
      }
    });

    return {
      title,
      company,
      location: location || 'Japan',
      salary,
      description,
      tags,
    };
  }

  /**
   * Extract numeric job ID from URL path /company/{companyId}/job/{jobId}
   */
  private extractJobId(url: string): string {
    const match = url.match(/\/job\/(\d+)/);
    return match ? match[1] : url;
  }
}
