import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const REMOTEOK_API_URL = 'https://remoteok.com/api';

export interface RemoteOKCrawlOptions {
  tag?: string; // Filter by tag like 'javascript', 'python', 'devops'
  limit?: number;
}

export interface RemoteOKCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  errorMessage?: string;
}

interface RemoteOKJob {
  slug: string;
  id: string;
  epoch: number;
  date: string;
  company: string;
  company_logo: string;
  position: string;
  tags: string[];
  logo: string;
  description: string;
  location: string;
  salary_min?: number;
  salary_max?: number;
  url: string;
}

@Injectable()
export class RemoteOKCrawler {
  private readonly logger = new Logger(RemoteOKCrawler.name);
  private readonly limiter: Bottleneck;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    // RemoteOK asks for respectful rate limiting
    const delayMs = this.configService.get<number>('CRAWLER_REMOTEOK_DELAY_MS') || 1000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });
  }

  /**
   * Crawl RemoteOK job listings via their public JSON API
   */
  async crawlJobs(options: RemoteOKCrawlOptions = {}): Promise<RemoteOKCrawlResult> {
    const tag = options.tag;
    const limit = options.limit || 50;

    // Create a crawl job
    const job = await this.crawledDataService.createJob('remoteok', { tag, limit });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting RemoteOK crawl - Tag: "${tag || 'all'}", Limit: ${limit}`);

      // Build API URL
      let apiUrl = REMOTEOK_API_URL;
      if (tag) {
        apiUrl = `${REMOTEOK_API_URL}?tag=${encodeURIComponent(tag)}`;
      }

      // Fetch jobs from API
      const response = await this.limiter.schedule(() =>
        fetch(apiUrl, {
          headers: {
            'User-Agent': 'Team@Once Bot/1.0 (Data Collection for Talent Matching)',
            'Accept': 'application/json',
          },
        })
      );

      if (!response.ok) {
        throw new Error(`RemoteOK API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as RemoteOKJob[];

      // First item is usually metadata/legal notice, skip it
      const jobs = data.filter((item: any) => item.id && item.position).slice(0, limit);

      const itemsFound = jobs.length;
      let itemsNew = 0;
      let itemsSkipped = 0;

      this.logger.log(`Found ${itemsFound} jobs from RemoteOK API, processing...`);

      for (const remoteJob of jobs) {
        const sourceUrl = remoteJob.url || `https://remoteok.com/remote-jobs/${remoteJob.slug}`;

        // Check if already crawled (by URL or source_id)
        const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
          || await this.crawledDataService.existsBySourceId('remoteok', String(remoteJob.id));
        if (exists) {
          itemsSkipped++;
          continue;
        }

        try {
          const rawData = {
            title: remoteJob.position,
            company: remoteJob.company,
            companyLogo: remoteJob.company_logo || remoteJob.logo,
            description: remoteJob.description,
            location: remoteJob.location || 'Remote',
            tags: remoteJob.tags || [],
            salaryMin: remoteJob.salary_min,
            salaryMax: remoteJob.salary_max,
            postedAt: remoteJob.date,
            epoch: remoteJob.epoch,
            slug: remoteJob.slug,
          };

          await this.crawledDataService.create({
            source: 'remoteok',
            type: 'job_post',
            sourceUrl,
            sourceId: remoteJob.id,
            rawData,
            crawledAt: new Date(),
          });

          itemsNew++;
        } catch (error) {
          this.logger.error(`Failed to save RemoteOK job ${remoteJob.id}: ${error.message}`);
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

      this.logger.log(`RemoteOK crawl completed. Found: ${itemsFound}, New: ${itemsNew}, Skipped: ${itemsSkipped}`);

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
      };
    } catch (error) {
      this.logger.error(`RemoteOK crawl failed: ${error.message}`);

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
}
