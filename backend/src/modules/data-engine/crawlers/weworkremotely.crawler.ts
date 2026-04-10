import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const WWR_RSS_BASE = 'https://weworkremotely.com/categories';

export interface WeWorkRemotelyCrawlOptions {
  category?: string;
  limit?: number;
}

export interface WeWorkRemotelyCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  errorMessage?: string;
}

@Injectable()
export class WeWorkRemotelyCrawler {
  private readonly logger = new Logger(WeWorkRemotelyCrawler.name);
  private readonly limiter: Bottleneck;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    const delayMs = this.configService.get<number>('CRAWLER_WWR_DELAY_MS') || 1000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });
  }

  /**
   * Crawl WeWorkRemotely job listings via RSS feed
   */
  async crawlJobs(options: WeWorkRemotelyCrawlOptions = {}): Promise<WeWorkRemotelyCrawlResult> {
    const category = options.category || 'remote-programming-jobs';
    const limit = options.limit || 50;

    const job = await this.crawledDataService.createJob('weworkremotely', { category, limit });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting WeWorkRemotely crawl - Category: "${category}", Limit: ${limit}`);

      const rssUrl = `${WWR_RSS_BASE}/${category}.rss`;

      const response = await this.limiter.schedule(() =>
        fetch(rssUrl, {
          headers: {
            'User-Agent': 'Team@Once Bot/1.0 (Data Collection for Talent Matching)',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
        }),
      );

      if (!response.ok) {
        throw new Error(`WeWorkRemotely RSS returned ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();

      // Parse RSS items from XML
      const items = this.parseRssItems(xml);
      const limitedItems = items.slice(0, limit);

      const itemsFound = limitedItems.length;
      let itemsNew = 0;
      let itemsSkipped = 0;

      this.logger.log(`Found ${itemsFound} jobs from WeWorkRemotely RSS, processing...`);

      for (const item of limitedItems) {
        const sourceUrl = item.link;

        if (!sourceUrl) {
          itemsSkipped++;
          continue;
        }

        const wwrSourceId = this.extractSourceId(sourceUrl);
        const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
          || await this.crawledDataService.existsBySourceId('weworkremotely', wwrSourceId);
        if (exists) {
          itemsSkipped++;
          continue;
        }

        try {
          const rawData = {
            title: item.title,
            company: this.extractCompany(item.title),
            description: item.description,
            location: 'Remote',
            category,
            postedAt: item.pubDate,
            url: sourceUrl,
          };

          await this.crawledDataService.create({
            source: 'weworkremotely',
            type: 'job_post',
            sourceUrl,
            sourceId: wwrSourceId,
            rawData,
            crawledAt: new Date(),
          });

          itemsNew++;
        } catch (error) {
          this.logger.error(`Failed to save WWR job: ${error.message}`);
        }
      }

      await this.crawledDataService.updateJob(job.id, {
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
        completedAt: new Date(),
      });

      this.logger.log(`WeWorkRemotely crawl completed. Found: ${itemsFound}, New: ${itemsNew}, Skipped: ${itemsSkipped}`);

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
      };
    } catch (error) {
      this.logger.error(`WeWorkRemotely crawl failed: ${error.message}`);

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
   * Parse RSS XML to extract <item> elements
   */
  private parseRssItems(xml: string): Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
  }> {
    const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];

    // Split by <item> tags
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];

      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link');
      const description = this.extractTag(itemXml, 'description');
      const pubDate = this.extractTag(itemXml, 'pubDate');

      if (title && link) {
        items.push({
          title: this.decodeHtmlEntities(title),
          link,
          description: this.decodeHtmlEntities(description || ''),
          pubDate: pubDate || '',
        });
      }
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | null {
    // Handle CDATA sections
    const cdataRegex = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`);
    const cdataMatch = cdataRegex.exec(xml);
    if (cdataMatch) return cdataMatch[1].trim();

    // Handle regular content
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
    const match = regex.exec(xml);
    return match ? match[1].trim() : null;
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }

  private extractCompany(title: string): string {
    // WWR titles often follow "Company: Job Title" pattern
    const colonIdx = title.indexOf(':');
    if (colonIdx > 0) {
      return title.substring(0, colonIdx).trim();
    }
    return '';
  }

  private extractSourceId(url: string): string {
    // Extract the last path segment as source ID
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  }
}
