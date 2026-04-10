import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const TOKYODEV_BASE_URL = 'https://www.tokyodev.com';
const TOKYODEV_JOBS_URL = `${TOKYODEV_BASE_URL}/jobs`;

export interface TokyoDevCrawlOptions {
  limit?: number;
  page?: number;
  autoPaginate?: boolean;
  maxPages?: number;
}

export interface TokyoDevCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  pagesScanned: number;
  lastPage: number;
  errorMessage?: string;
}

interface TokyoDevJob {
  title: string;
  company: string;
  location: string;
  jobType: string;
  salary?: string;
  tags: string[];
  jobUrl: string;
  description?: string;
}

@Injectable()
export class TokyoDevCrawler {
  private readonly logger = new Logger(TokyoDevCrawler.name);
  private readonly limiter: Bottleneck;
  private readonly userAgent: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    // Be respectful with rate limiting
    const delayMs = this.configService.get<number>('CRAWLER_TOKYODEV_DELAY_MS') || 2000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });

    this.userAgent = this.configService.get<string>('CRAWLER_USER_AGENT') ||
      'Team@Once Bot/1.0 (Data Collection for Talent Matching; contact@teamatonce.com)';
  }

  /**
   * Crawl TokyoDev job listings (Japan tech jobs).
   *
   * With autoPaginate (default), fetches successive listing pages
   * (?page=1, ?page=2, …) until `limit` NEW jobs are stored,
   * or `maxPages` pages are scanned, or no more jobs found on page.
   */
  async crawlJobs(options: TokyoDevCrawlOptions = {}): Promise<TokyoDevCrawlResult> {
    const limit = options.limit || 30;
    const startPage = options.page || 1;
    const autoPaginate = options.autoPaginate ?? true;
    const maxPages = options.maxPages || 5;

    const job = await this.crawledDataService.createJob('tokyodev', {
      limit, page: startPage, autoPaginate, maxPages,
    });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(
        `Starting TokyoDev crawl — Limit: ${limit}, Page: ${startPage}, ` +
        `AutoPaginate: ${autoPaginate}, MaxPages: ${maxPages}`,
      );

      let totalFound = 0;
      let totalNew = 0;
      let totalSkipped = 0;
      let currentPage = startPage;
      let pagesScanned = 0;
      const pageLimit = autoPaginate ? maxPages : 1;

      while (pagesScanned < pageLimit) {
        if (totalNew >= limit) break;

        const pageUrl = currentPage === 1
          ? TOKYODEV_JOBS_URL
          : `${TOKYODEV_JOBS_URL}?page=${currentPage}`;

        this.logger.log(`Fetching TokyoDev page ${currentPage} (${pagesScanned + 1}/${pageLimit})...`);

        const response = await this.limiter.schedule(() =>
          fetch(pageUrl, {
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }),
        );

        if (!response.ok) {
          throw new Error(`TokyoDev returned ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        // Parse a generous number per page — dedup handles the rest
        const pageJobs = this.parseJobListings(html, 200);

        if (pageJobs.length === 0) {
          this.logger.log(`Page ${currentPage} returned 0 jobs — no more data.`);
          break;
        }

        totalFound += pageJobs.length;

        for (const tokyoJob of pageJobs) {
          if (totalNew >= limit) break;

          const sourceUrl = tokyoJob.jobUrl;
          const sourceId = this.extractJobId(sourceUrl);

          const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
            || await this.crawledDataService.existsBySourceId('tokyodev', sourceId);
          if (exists) {
            totalSkipped++;
            continue;
          }

          try {
            let description = tokyoJob.description || '';
            if (!description && sourceUrl) {
              description = await this.fetchJobDescription(sourceUrl);
            }

            const rawData = {
              title: tokyoJob.title,
              company: tokyoJob.company,
              location: tokyoJob.location,
              jobType: tokyoJob.jobType,
              salary: tokyoJob.salary,
              tags: tokyoJob.tags,
              description,
              region: 'Japan',
            };

            await this.crawledDataService.create({
              source: 'tokyodev',
              type: 'job_post',
              sourceUrl,
              sourceId,
              rawData,
              crawledAt: new Date(),
            });

            totalNew++;
            this.logger.debug(`Crawled TokyoDev job: ${tokyoJob.title} (${totalNew}/${limit} new)`);
          } catch (error) {
            this.logger.error(`Failed to save TokyoDev job: ${error.message}`);
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
        `TokyoDev crawl completed. Pages: ${pagesScanned}, Found: ${totalFound}, ` +
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
      this.logger.error(`TokyoDev crawl failed: ${error.message}`);

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
   * Parse job listings from TokyoDev HTML
   */
  private parseJobListings(html: string, limit: number): TokyoDevJob[] {
    const $ = cheerio.load(html);
    const jobs: TokyoDevJob[] = [];

    // TokyoDev job listings - try multiple selectors
    const jobCards = $('article, .job-listing, [data-job], .job-card, .tw-card, a[href*="/jobs/"]').slice(0, limit * 2);

    jobCards.each((_, element) => {
      if (jobs.length >= limit) return;

      try {
        const $el = $(element);

        // Try to find job link
        let jobUrl = '';
        let title = '';

        // Check if element itself is a link
        if ($el.is('a') && $el.attr('href')?.includes('/jobs/')) {
          jobUrl = $el.attr('href') || '';
          title = $el.find('h2, h3, .title, .job-title').first().text().trim() ||
                  $el.text().trim().split('\n')[0].trim();
        } else {
          // Find link within element
          const linkEl = $el.find('a[href*="/jobs/"]').first();
          jobUrl = linkEl.attr('href') || '';
          title = linkEl.text().trim() ||
                  $el.find('h2, h3, .title, .job-title').first().text().trim();
        }

        if (!jobUrl || !title) return;

        // Ensure full URL
        if (!jobUrl.startsWith('http')) {
          jobUrl = `${TOKYODEV_BASE_URL}${jobUrl}`;
        }

        // Extract company
        const company = $el.find('.company, .company-name, [data-company]').text().trim() ||
                       $el.find('span, div').filter((_, el) => {
                         const text = $(el).text().toLowerCase();
                         return text.includes('at ') || text.includes('company');
                       }).first().text().replace(/at /i, '').trim() || '';

        // Extract location
        const location = $el.find('.location, [data-location]').text().trim() ||
                        'Tokyo, Japan';

        // Extract job type
        const jobType = $el.find('.job-type, .type, [data-type]').text().trim() ||
                       ($el.text().toLowerCase().includes('remote') ? 'Remote' : 'On-site');

        // Extract salary if available
        const salaryEl = $el.find('.salary, [data-salary]');
        const salary = salaryEl.text().trim() || undefined;

        // Extract tags/skills
        const tags: string[] = [];
        $el.find('.tag, .skill, .badge, [data-tag]').each((_, tagEl) => {
          const tag = $(tagEl).text().trim();
          if (tag && tag.length < 30) tags.push(tag);
        });

        // Skip if we already have this URL
        if (jobs.some(j => j.jobUrl === jobUrl)) return;

        jobs.push({
          title,
          company,
          location,
          jobType,
          salary,
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
   * Fetch full job description from job detail page
   */
  private async fetchJobDescription(jobUrl: string): Promise<string> {
    try {
      const response = await this.limiter.schedule(() =>
        fetch(jobUrl, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html',
          },
        })
      );

      if (!response.ok) return '';

      const html = await response.text();
      const $ = cheerio.load(html);

      // Try to find job description
      const description = $('.job-description, .description, article, .content, main')
        .first()
        .text()
        .trim()
        .substring(0, 5000); // Limit description length

      return description;
    } catch (error) {
      this.logger.debug(`Failed to fetch job description: ${error.message}`);
      return '';
    }
  }

  /**
   * Extract job ID from URL
   */
  private extractJobId(url: string): string {
    const match = url.match(/\/jobs\/([^/?]+)/);
    return match ? match[1] : url;
  }
}
