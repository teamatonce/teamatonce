import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const ARBEITNOW_API_URL = 'https://www.arbeitnow.com/api/job-board-api';

export interface ArbeitnowCrawlOptions {
  limit?: number;
}

export interface ArbeitnowCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  errorMessage?: string;
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

@Injectable()
export class ArbeitnowCrawler {
  private readonly logger = new Logger(ArbeitnowCrawler.name);
  private readonly limiter: Bottleneck;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    // Respectful rate limiting
    const delayMs = this.configService.get<number>('CRAWLER_ARBEITNOW_DELAY_MS') || 1000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });
  }

  /**
   * Crawl Arbeitnow job listings via their public JSON API (European tech jobs)
   */
  async crawlJobs(options: ArbeitnowCrawlOptions = {}): Promise<ArbeitnowCrawlResult> {
    const limit = options.limit || 50;

    // Create a crawl job
    const job = await this.crawledDataService.createJob('arbeitnow', { limit });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting Arbeitnow crawl, limit: ${limit}`);

      // Fetch jobs from API
      const response = await this.limiter.schedule(() =>
        fetch(ARBEITNOW_API_URL, {
          headers: {
            'User-Agent': 'Team@Once Bot/1.0 (Data Collection for Talent Matching)',
            'Accept': 'application/json',
          },
        })
      );

      if (!response.ok) {
        throw new Error(`Arbeitnow API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { data: ArbeitnowJob[] };
      const jobs = (data.data || []).slice(0, limit);

      const itemsFound = jobs.length;
      let itemsNew = 0;
      let itemsSkipped = 0;

      this.logger.log(`Found ${itemsFound} jobs from Arbeitnow API, processing...`);

      for (const arbeitnowJob of jobs) {
        const sourceUrl = arbeitnowJob.url || `https://www.arbeitnow.com/jobs/${arbeitnowJob.slug}`;

        // Check if already crawled (by URL or source_id)
        const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
          || await this.crawledDataService.existsBySourceId('arbeitnow', arbeitnowJob.slug);
        if (exists) {
          itemsSkipped++;
          continue;
        }

        try {
          const rawData = {
            title: arbeitnowJob.title,
            company: arbeitnowJob.company_name,
            description: this.stripHtml(arbeitnowJob.description),
            location: arbeitnowJob.location || 'Europe',
            remote: arbeitnowJob.remote,
            tags: arbeitnowJob.tags || [],
            jobTypes: arbeitnowJob.job_types || [],
            postedAt: arbeitnowJob.created_at
              ? new Date(arbeitnowJob.created_at * 1000).toISOString()
              : null,
            slug: arbeitnowJob.slug,
            region: 'Europe',
          };

          await this.crawledDataService.create({
            source: 'arbeitnow',
            type: 'job_post',
            sourceUrl,
            sourceId: arbeitnowJob.slug,
            rawData,
            crawledAt: new Date(),
          });

          itemsNew++;
        } catch (error) {
          this.logger.error(`Failed to save Arbeitnow job ${arbeitnowJob.slug}: ${error.message}`);
        }
      }

      // Update job as completed
      await this.crawledDataService.updateJob(job.id, {
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
        completedAt: new Date(),
      });

      this.logger.log(`Arbeitnow crawl completed. Found: ${itemsFound}, New: ${itemsNew}, Skipped: ${itemsSkipped}`);

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
      };
    } catch (error) {
      this.logger.error(`Arbeitnow crawl failed: ${error.message}`);

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
        errorMessage: error.message,
      };
    }
  }

  /**
   * Strip HTML tags from description
   */
  private stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);
  }
}
