import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import { CrawledDataService } from '../services/crawled-data.service';

const JAPANDEV_PAYLOAD_URL = 'https://japan-dev.com/_payload.json';
const JAPANDEV_BASE_URL = 'https://japan-dev.com';

export interface JapanDevCrawlOptions {
  limit?: number;
}

export interface JapanDevCrawlResult {
  jobId: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  errorMessage?: string;
}

interface JapanDevJob {
  id: number;
  title: string;
  slug: string;
  intro?: string;
  technologies?: string[];
  location?: string;
  salary_min?: number;
  salary_max?: number;
  remote_level?: string;
  japanese_level?: string;
  company?: {
    name?: string;
    slug?: string;
    homepage_url?: string;
    employee_count?: string;
    short_description?: string;
  };
}

@Injectable()
export class JapanDevCrawler {
  private readonly logger = new Logger(JapanDevCrawler.name);
  private readonly limiter: Bottleneck;
  private readonly userAgent: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly crawledDataService: CrawledDataService,
  ) {
    const delayMs = this.configService.get<number>('CRAWLER_JAPANDEV_DELAY_MS') || 1000;
    this.limiter = new Bottleneck({
      minTime: delayMs,
      maxConcurrent: 1,
    });

    this.userAgent = this.configService.get<string>('CRAWLER_USER_AGENT') ||
      'Team@Once Bot/1.0 (Data Collection for Talent Matching; contact@teamatonce.com)';
  }

  /**
   * Crawl Japan Dev job listings via their Nuxt payload JSON.
   * Single fetch gets all jobs — no pagination needed.
   */
  async crawlJobs(options: JapanDevCrawlOptions = {}): Promise<JapanDevCrawlResult> {
    const limit = options.limit || 300;

    const job = await this.crawledDataService.createJob('japandev', { limit });

    try {
      await this.crawledDataService.updateJob(job.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting Japan Dev crawl, limit: ${limit}`);

      // Fetch the Nuxt payload
      const response = await this.limiter.schedule(() =>
        fetch(JAPANDEV_PAYLOAD_URL, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json,*/*',
          },
        }),
      );

      if (!response.ok) {
        throw new Error(`Japan Dev payload returned ${response.status}: ${response.statusText}`);
      }

      const payloadText = await response.text();
      const jobs = this.parseNuxtPayload(payloadText);

      const itemsFound = jobs.length;
      let itemsNew = 0;
      let itemsSkipped = 0;

      this.logger.log(`Parsed ${itemsFound} jobs from Japan Dev payload, processing up to ${limit}...`);

      for (const japanDevJob of jobs) {
        if (itemsNew >= limit) break;

        const sourceId = String(japanDevJob.id);
        const sourceUrl = `${JAPANDEV_BASE_URL}/jobs/${japanDevJob.slug}`;

        // Dedup check
        const exists = await this.crawledDataService.existsBySourceUrl(sourceUrl)
          || await this.crawledDataService.existsBySourceId('japandev', sourceId);
        if (exists) {
          itemsSkipped++;
          continue;
        }

        try {
          const salaryParts: string[] = [];
          if (japanDevJob.salary_min) salaryParts.push(`${japanDevJob.salary_min}`);
          if (japanDevJob.salary_max) salaryParts.push(`${japanDevJob.salary_max}`);
          const salary = salaryParts.length > 0 ? salaryParts.join(' - ') : '';

          const rawData = {
            title: japanDevJob.title,
            company: japanDevJob.company?.name || '',
            companyWebsite: japanDevJob.company?.homepage_url || '',
            companyEmployeeCount: japanDevJob.company?.employee_count || '',
            companyDescription: japanDevJob.company?.short_description || '',
            location: japanDevJob.location || 'Japan',
            salary,
            salaryMin: japanDevJob.salary_min || null,
            salaryMax: japanDevJob.salary_max || null,
            description: japanDevJob.intro || '',
            tags: japanDevJob.technologies || [],
            remoteLevel: japanDevJob.remote_level || '',
            japaneseLevel: japanDevJob.japanese_level || '',
            region: 'Japan',
          };

          await this.crawledDataService.create({
            source: 'japandev',
            type: 'job_post',
            sourceUrl,
            sourceId,
            rawData,
            crawledAt: new Date(),
          });

          itemsNew++;
          this.logger.debug(`Crawled Japan Dev job: ${japanDevJob.title} (${itemsNew}/${limit} new)`);
        } catch (error) {
          this.logger.error(`Failed to save Japan Dev job ${japanDevJob.slug}: ${error.message}`);
        }
      }

      await this.crawledDataService.updateJob(job.id, {
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
        completedAt: new Date(),
      });

      this.logger.log(`Japan Dev crawl completed. Found: ${itemsFound}, New: ${itemsNew}, Skipped: ${itemsSkipped}`);

      return {
        jobId: job.id,
        status: 'completed',
        itemsFound,
        itemsNew,
        itemsSkipped,
      };
    } catch (error) {
      this.logger.error(`Japan Dev crawl failed: ${error.message}`);

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
   * Parse the Nuxt _payload.json to extract job objects.
   *
   * Nuxt 3 uses a "devalue" format: the payload is a top-level JSON array
   * where element [0] is the root schema and subsequent elements are values.
   * Object values are numeric indices pointing to other elements in the
   * array. We resolve these references to reconstruct real objects.
   */
  private parseNuxtPayload(text: string): JapanDevJob[] {
    const jobs: JapanDevJob[] = [];

    try {
      const payload = JSON.parse(text);

      if (!Array.isArray(payload) || payload.length < 6) {
        this.logger.warn('Unexpected payload format — not a Nuxt devalue array');
        return jobs;
      }

      // Find the jobs index array. Walk the root schema to locate it.
      // Schema: [0].data → ref → { jobs: ref → [idx1, idx2, ...] }
      const jobIndices = this.findJobIndices(payload);

      if (jobIndices.length === 0) {
        this.logger.warn('Could not locate job indices in payload');
        return jobs;
      }

      this.logger.debug(`Found ${jobIndices.length} job indices in payload`);

      for (const idx of jobIndices) {
        try {
          const resolved = this.resolveDevalue(payload, idx, 0);
          if (resolved && this.isJobObject(resolved)) {
            jobs.push(this.normalizeJob(resolved));
          }
        } catch (error) {
          this.logger.debug(`Failed to resolve job at index ${idx}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to parse Nuxt payload: ${error.message}`);
    }

    // Deduplicate by id
    const seen = new Set<number>();
    return jobs.filter(job => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });
  }

  /**
   * Walk the devalue root schema to find the array of job indices.
   * Expected path: root[0].data → ref → { jobs: ref → [idx, idx, ...] }
   */
  private findJobIndices(payload: any[]): number[] {
    try {
      const root = payload[0];
      if (!root || typeof root.data !== 'number') return [];

      // Resolve root.data → should be a ShallowReactive wrapper or direct object
      let dataRef = root.data;

      // Skip ShallowReactive wrappers: ["ShallowReactive", ref]
      let resolved = payload[dataRef];
      while (Array.isArray(resolved) && resolved[0] === 'ShallowReactive') {
        dataRef = resolved[1];
        resolved = payload[dataRef];
      }

      // resolved should be an object like { "options:asyncdata:...": ref }
      if (typeof resolved === 'object' && !Array.isArray(resolved)) {
        // Find the key that contains the async data
        for (const key of Object.keys(resolved)) {
          const innerRef = resolved[key];
          if (typeof innerRef !== 'number') continue;

          const inner = payload[innerRef];
          if (typeof inner === 'object' && !Array.isArray(inner) && typeof inner.jobs === 'number') {
            const jobsArray = payload[inner.jobs];
            if (Array.isArray(jobsArray) && jobsArray.every((v: any) => typeof v === 'number')) {
              return jobsArray;
            }
          }
        }
      }
    } catch {
      // fall through
    }
    return [];
  }

  /**
   * Resolve a Nuxt devalue reference recursively.
   * Each object's values are indices into the payload array.
   * depth limit prevents infinite loops on circular refs.
   */
  private resolveDevalue(payload: any[], index: number, depth: number): any {
    if (depth > 10) return null;
    if (index < 0 || index >= payload.length) return null;

    const val = payload[index];

    // Primitives: string, number, boolean, null — return as-is
    if (val === null || typeof val !== 'object') return val;

    // Array of refs
    if (Array.isArray(val)) {
      // ShallowReactive wrapper
      if (val[0] === 'ShallowReactive' && typeof val[1] === 'number') {
        return this.resolveDevalue(payload, val[1], depth + 1);
      }
      return val.map(item =>
        typeof item === 'number' ? this.resolveDevalue(payload, item, depth + 1) : item,
      );
    }

    // Object: resolve each value
    const result: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      const ref = val[key];
      if (typeof ref === 'number') {
        result[key] = this.resolveDevalue(payload, ref, depth + 1);
      } else {
        result[key] = ref;
      }
    }
    return result;
  }

  /**
   * Check if a resolved object looks like a Japan Dev job listing.
   */
  private isJobObject(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;

    const hasTitle = typeof obj.title === 'string' && obj.title.length > 0;
    const hasSlug = typeof obj.slug === 'string' && obj.slug.length > 0;

    if (!hasTitle || !hasSlug) return false;

    const hasId = typeof obj.id === 'number';
    const hasSalary = typeof obj.salary_min === 'number' || typeof obj.salary_max === 'number';
    const hasTechnologies = Array.isArray(obj.technologies) || Array.isArray(obj.skills);

    return hasId || hasSalary || hasTechnologies;
  }

  /**
   * Normalize a resolved job object into our standard structure.
   */
  private normalizeJob(obj: any): JapanDevJob {
    // Technologies come from either `technologies` or `skills` arrays.
    // In the devalue payload, skills are objects with { name, system_name }.
    let technologies: string[] = [];
    if (Array.isArray(obj.technologies) && obj.technologies.length > 0) {
      technologies = obj.technologies.map((t: any) =>
        typeof t === 'string' ? t : t?.name || '',
      ).filter(Boolean);
    } else if (Array.isArray(obj.skills) && obj.skills.length > 0) {
      technologies = obj.skills.map((s: any) =>
        typeof s === 'string' ? s : s?.name || '',
      ).filter(Boolean);
    }

    return {
      id: obj.id || 0,
      title: obj.title || '',
      slug: obj.slug || '',
      intro: obj.intro || obj.description || '',
      technologies,
      location: obj.location || '',
      salary_min: typeof obj.salary_min === 'number' ? obj.salary_min : undefined,
      salary_max: typeof obj.salary_max === 'number' ? obj.salary_max : undefined,
      remote_level: obj.remote_level || obj.remoteLevel || '',
      japanese_level: obj.japanese_level || obj.japaneseLevel || '',
      company: obj.company && typeof obj.company === 'object' ? {
        name: obj.company.name || '',
        slug: obj.company.slug || '',
        homepage_url: obj.company.homepage_url || obj.company.homepageUrl || '',
        employee_count: obj.company.employee_count || obj.company.employeeCount || '',
        short_description: obj.company.short_description || obj.company.shortDescription || '',
      } : undefined,
    };
  }

}
