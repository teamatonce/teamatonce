import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const WANTEDLY_BASE_URL = 'https://www.wantedly.com';
const WANTEDLY_PROJECTS_URL = `${WANTEDLY_BASE_URL}/projects`;

export interface WantedlyCrawlOptions {
  location?: string;
  limit?: number;
  page?: number;
  autoPaginate?: boolean;
  maxPages?: number;
}

export interface WantedlyCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  pagesScanned: number;
  lastPage: number;
  errorMessage?: string;
}

interface WantedlyJob {
  title: string;
  company: string;
  location: string;
  description: string;
  tags: string[];
  jobUrl: string;
}

@Injectable()
export class WantedlyCrawler {
  private readonly logger = new Logger(WantedlyCrawler.name);
  private readonly limiter: Bottleneck;
  private readonly userAgent: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    const delayMs = this.configService.get<number>('CRAWLER_WANTEDLY_DELAY_MS') || 2000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });

    this.userAgent = this.configService.get<string>('CRAWLER_USER_AGENT') ||
      'Team@Once Bot/1.0 (Data Collection for Talent Matching; contact@teamatonce.com)';
  }

  /**
   * Crawl Wantedly job listings (Japanese social hiring platform).
   *
   * With autoPaginate (default), fetches successive listing pages
   * (?page=1, ?page=2, …) until `limit` NEW jobs are stored,
   * or `maxPages` pages are scanned, or no more jobs found on page.
   */
  async crawlJobs(options: WantedlyCrawlOptions = {}): Promise<WantedlyCrawlResult> {
    const limit = options.limit || 30;
    const startPage = options.page || 1;
    const autoPaginate = options.autoPaginate ?? true;
    const maxPages = options.maxPages || 5;

    const job = await this.crawledDataService.createJob('wantedly', {
      limit, location: options.location, page: startPage, autoPaginate, maxPages,
    });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(
        `Starting Wantedly crawl — Limit: ${limit}, Location: ${options.location || 'any'}, ` +
        `Page: ${startPage}, AutoPaginate: ${autoPaginate}, MaxPages: ${maxPages}`,
      );

      let totalFound = 0;
      let totalNew = 0;
      let totalSkipped = 0;
      let currentPage = startPage;
      let pagesScanned = 0;
      const pageLimit = autoPaginate ? maxPages : 1;

      while (pagesScanned < pageLimit) {
        if (totalNew >= limit) break;

        // Build URL with page and optional location filter
        const params = new URLSearchParams();
        if (options.location) {
          params.set('q', options.location);
        }
        if (currentPage > 1) {
          params.set('page', String(currentPage));
        }
        const queryString = params.toString();
        const pageUrl = queryString
          ? `${WANTEDLY_PROJECTS_URL}?${queryString}`
          : WANTEDLY_PROJECTS_URL;

        this.logger.log(`Fetching Wantedly page ${currentPage} (${pagesScanned + 1}/${pageLimit})...`);

        const response = await this.limiter.schedule(() =>
          fetch(pageUrl, {
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
            },
          }),
        );

        if (!response.ok) {
          throw new Error(`Wantedly returned ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const pageJobs = this.parseJobListings(html, 200);

        if (pageJobs.length === 0) {
          this.logger.log(`Page ${currentPage} returned 0 jobs — no more data.`);
          break;
        }

        totalFound += pageJobs.length;

        for (const wantedlyJob of pageJobs) {
          if (totalNew >= limit) break;

          const sourceUrl = wantedlyJob.jobUrl;
          const sourceId = this.extractProjectId(sourceUrl);

          const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
            || await this.crawledDataService.existsBySourceId('wantedly', sourceId);
          if (exists) {
            totalSkipped++;
            continue;
          }

          try {
            const rawData = {
              title: wantedlyJob.title,
              company: wantedlyJob.company,
              location: wantedlyJob.location,
              description: wantedlyJob.description,
              tags: wantedlyJob.tags,
              region: 'Japan',
            };

            await this.crawledDataService.create({
              source: 'wantedly',
              type: 'job_post',
              sourceUrl,
              sourceId,
              rawData,
              crawledAt: new Date(),
            });

            totalNew++;
            this.logger.debug(`Crawled Wantedly job: ${wantedlyJob.title} (${totalNew}/${limit} new)`);
          } catch (error) {
            this.logger.error(`Failed to save Wantedly job: ${error.message}`);
          }
        }

        pagesScanned++;
        currentPage++;
      }

      await this.crawledDataService.updateJob(job.id, {
        status: 'completed',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsSkipped: totalSkipped,
        completedAt: new Date(),
      });

      this.logger.log(
        `Wantedly crawl completed. Pages: ${pagesScanned}, Found: ${totalFound}, ` +
        `New: ${totalNew}, Skipped: ${totalSkipped}`,
      );

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound: totalFound,
        itemsNew: totalNew,
        itemsSkipped: totalSkipped,
        pagesScanned,
        lastPage: currentPage - 1,
      };
    } catch (error) {
      this.logger.error(`Wantedly crawl failed: ${error.message}`);

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
        pagesScanned: 0,
        lastPage: 0,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Parse job listings from Wantedly HTML
   */
  private parseJobListings(html: string, limit: number): WantedlyJob[] {
    const $ = cheerio.load(html);
    const jobs: WantedlyJob[] = [];

    // Wantedly project cards - try multiple selectors
    const projectCards = $('a[href*="/projects/"], .project-card, [data-el="project-card"], article').slice(0, limit * 2);

    projectCards.each((_, element) => {
      if (jobs.length >= limit) return;

      try {
        const $el = $(element);

        // Find job link and title
        let jobUrl = '';
        let title = '';

        if ($el.is('a') && $el.attr('href')?.includes('/projects/')) {
          jobUrl = $el.attr('href') || '';
          title = $el.find('h2, h3, .title, [class*="title"]').first().text().trim() ||
                  $el.text().trim().split('\n')[0].trim();
        } else {
          const linkEl = $el.find('a[href*="/projects/"]').first();
          jobUrl = linkEl.attr('href') || '';
          title = linkEl.text().trim() ||
                  $el.find('h2, h3, .title, [class*="title"]').first().text().trim();
        }

        if (!jobUrl || !title) return;

        // Ensure full URL
        if (!jobUrl.startsWith('http')) {
          jobUrl = `${WANTEDLY_BASE_URL}${jobUrl}`;
        }

        // Extract company name
        const company = $el.find('[class*="company"], .company-name, [data-company]').text().trim() ||
                        $el.find('span, div').filter((_, el) => {
                          const cls = $(el).attr('class') || '';
                          return cls.includes('company') || cls.includes('org');
                        }).first().text().trim() || '';

        // Extract location
        const location = $el.find('[class*="location"], .location').text().trim() || 'Japan';

        // Extract description snippet
        const description = $el.find('[class*="description"], [class*="body"], p').first().text().trim().substring(0, 2000) || '';

        // Extract tags
        const tags: string[] = [];
        $el.find('.tag, [class*="tag"], [class*="skill"], .badge, .label').each((_, tagEl) => {
          const tag = $(tagEl).text().trim();
          if (tag && tag.length < 50) tags.push(tag);
        });

        // Skip duplicates within this parse
        if (jobs.some(j => j.jobUrl === jobUrl)) return;

        jobs.push({
          title,
          company,
          location,
          description,
          tags,
          jobUrl,
        });
      } catch (e) {
        // Skip malformed entries
      }
    });

    return jobs;
  }

  /**
   * Extract project ID from URL
   */
  private extractProjectId(url: string): string {
    const match = url.match(/\/projects\/(\d+)/);
    return match ? match[1] : url;
  }
}
