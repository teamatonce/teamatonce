import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  CreatePortfolioItemDto,
  UpdatePortfolioItemDto,
  CreateCodeSnippetDto,
  PortfolioSource,
} from './dto/portfolio.dto';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(private readonly db: DatabaseService) {}

  // ============================================
  // PORTFOLIO ITEM CRUD
  // ============================================

  /**
   * Create a new portfolio item
   */
  async createPortfolioItem(userId: string, dto: CreatePortfolioItemDto) {
    const data = {
      user_id: userId,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      tech_stack: JSON.stringify(dto.tech_stack),
      images: JSON.stringify(dto.images || []),
      live_demo_url: dto.live_demo_url || null,
      github_url: dto.github_url || null,
      client_name: dto.client_name || null,
      outcomes: dto.outcomes || null,
      start_date: dto.start_date,
      end_date: dto.end_date || null,
      is_featured: dto.is_featured || false,
      source: PortfolioSource.MANUAL,
    };

    const item = await this.db.insert('portfolio_items', data);
    return this.parsePortfolioItem(item);
  }

  /**
   * Update a portfolio item (must be owned by the user)
   */
  async updatePortfolioItem(id: string, userId: string, dto: UpdatePortfolioItemDto) {
    const existing = await this.db.findOne('portfolio_items', { id });
    if (!existing) {
      throw new NotFoundException('Portfolio item not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only update your own portfolio items');
    }

    const data: Record<string, any> = { updated_at: new Date().toISOString() };

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.tech_stack !== undefined) data.tech_stack = JSON.stringify(dto.tech_stack);
    if (dto.images !== undefined) data.images = JSON.stringify(dto.images);
    if (dto.live_demo_url !== undefined) data.live_demo_url = dto.live_demo_url;
    if (dto.github_url !== undefined) data.github_url = dto.github_url;
    if (dto.client_name !== undefined) data.client_name = dto.client_name;
    if (dto.outcomes !== undefined) data.outcomes = dto.outcomes;
    if (dto.start_date !== undefined) data.start_date = dto.start_date;
    if (dto.end_date !== undefined) data.end_date = dto.end_date;
    if (dto.is_featured !== undefined) data.is_featured = dto.is_featured;

    const updated = await this.db.update('portfolio_items', id, data);
    return this.parsePortfolioItem(updated);
  }

  /**
   * Delete a portfolio item (must be owned by the user)
   */
  async deletePortfolioItem(id: string, userId: string) {
    const existing = await this.db.findOne('portfolio_items', { id });
    if (!existing) {
      throw new NotFoundException('Portfolio item not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own portfolio items');
    }

    // Delete associated snippets first
    await this.db.deleteMany('portfolio_snippets', { portfolio_item_id: id });
    await this.db.delete('portfolio_items', id);

    return { message: 'Portfolio item deleted successfully' };
  }

  /**
   * Get a single portfolio item by ID (public)
   */
  async getPortfolioItem(id: string) {
    const item = await this.db.findOne('portfolio_items', { id });
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    return this.parsePortfolioItem(item);
  }

  /**
   * Get all portfolio items for a user (paginated, public)
   */
  async getPortfolioByUser(
    userId: string,
    options: { page?: number; limit?: number; category?: string } = {},
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 50);
    const offset = (page - 1) * limit;

    const conditions: Record<string, any> = { user_id: userId };
    if (options.category) {
      conditions.category = options.category;
    }

    const result = await this.db.find('portfolio_items', conditions, {
      orderBy: 'created_at',
      order: 'desc',
      limit,
      offset,
    });

    return {
      data: (result.data || result).map((item: any) => this.parsePortfolioItem(item)),
      total: result.count || 0,
      page,
      limit,
    };
  }

  /**
   * Get featured portfolio items for a user (for profile card)
   */
  async getFeaturedPortfolio(userId: string) {
    const items = await this.db.findMany('portfolio_items', {
      user_id: userId,
      is_featured: true,
    }, {
      orderBy: 'created_at',
      order: 'desc',
    });

    return (items.data || items).map((item: any) => this.parsePortfolioItem(item));
  }

  // ============================================
  // GITHUB IMPORT
  // ============================================

  /**
   * Import pinned repositories from GitHub
   */
  async importFromGitHub(userId: string, githubToken: string) {
    try {
      // Fetch the authenticated user's login
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        throw new BadRequestException('Invalid GitHub token or API error');
      }

      const githubUser = (await userResponse.json()) as any;
      const login = githubUser.login;

      // Fetch pinned repos via GitHub GraphQL API
      const graphqlResponse = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `{
            user(login: "${login}") {
              pinnedItems(first: 6, types: REPOSITORY) {
                nodes {
                  ... on Repository {
                    name
                    description
                    url
                    stargazerCount
                    primaryLanguage { name }
                    languages(first: 10) { nodes { name } }
                  }
                }
              }
            }
          }`,
        }),
      });

      if (!graphqlResponse.ok) {
        // Fallback: fetch top repos via REST API if GraphQL fails
        return this.importFromGitHubRest(userId, githubToken);
      }

      const graphqlData = (await graphqlResponse.json()) as any;
      const pinnedRepos = graphqlData?.data?.user?.pinnedItems?.nodes || [];

      if (pinnedRepos.length === 0) {
        // Fallback to top starred repos
        return this.importFromGitHubRest(userId, githubToken);
      }

      const imported = [];
      for (const repo of pinnedRepos) {
        const techStack = repo.languages?.nodes?.map((l: any) => l.name) || [];
        if (repo.primaryLanguage?.name && !techStack.includes(repo.primaryLanguage.name)) {
          techStack.unshift(repo.primaryLanguage.name);
        }

        const item = await this.db.insert('portfolio_items', {
          user_id: userId,
          title: repo.name,
          description: repo.description || `GitHub repository: ${repo.name}`,
          category: 'other',
          tech_stack: JSON.stringify(techStack),
          images: JSON.stringify([]),
          github_url: repo.url,
          github_repo_url: repo.url,
          github_stars: repo.stargazerCount || 0,
          is_featured: false,
          source: PortfolioSource.GITHUB_IMPORT,
          start_date: new Date().toISOString().split('T')[0],
        });

        imported.push(this.parsePortfolioItem(item));
      }

      return { imported: imported.length, items: imported };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('GitHub import failed', error);
      throw new BadRequestException('Failed to import from GitHub: ' + (error as Error).message);
    }
  }

  /**
   * Fallback: import top starred repos via REST API
   */
  private async importFromGitHubRest(userId: string, githubToken: string) {
    const reposResponse = await fetch(
      'https://api.github.com/user/repos?sort=stars&direction=desc&per_page=6&type=owner',
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!reposResponse.ok) {
      throw new BadRequestException('Failed to fetch GitHub repositories');
    }

    const repos = (await reposResponse.json()) as any[];
    const imported = [];

    for (const repo of repos) {
      const techStack = repo.language ? [repo.language] : [];

      const item = await this.db.insert('portfolio_items', {
        user_id: userId,
        title: repo.name,
        description: repo.description || `GitHub repository: ${repo.name}`,
        category: 'other',
        tech_stack: JSON.stringify(techStack),
        images: JSON.stringify([]),
        github_url: repo.html_url,
        github_repo_url: repo.html_url,
        github_stars: repo.stargazers_count || 0,
        is_featured: false,
        source: PortfolioSource.GITHUB_IMPORT,
        start_date: repo.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      });

      imported.push(this.parsePortfolioItem(item));
    }

    return { imported: imported.length, items: imported };
  }

  // ============================================
  // CODE SNIPPETS
  // ============================================

  /**
   * Add a code snippet to a portfolio item
   */
  async addCodeSnippet(portfolioItemId: string, userId: string, dto: CreateCodeSnippetDto) {
    const item = await this.db.findOne('portfolio_items', { id: portfolioItemId });
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    if (item.user_id !== userId) {
      throw new ForbiddenException('You can only add snippets to your own portfolio items');
    }

    const snippet = await this.db.insert('portfolio_snippets', {
      portfolio_item_id: portfolioItemId,
      language: dto.language,
      filename: dto.filename,
      code: dto.code,
    });

    return snippet;
  }

  /**
   * List code snippets for a portfolio item (public)
   */
  async getSnippets(portfolioItemId: string) {
    const item = await this.db.findOne('portfolio_items', { id: portfolioItemId });
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }

    const snippets = await this.db.findMany('portfolio_snippets', {
      portfolio_item_id: portfolioItemId,
    }, {
      orderBy: 'created_at',
      order: 'asc',
    });

    return snippets.data || snippets;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Parse JSONB fields from DB rows
   */
  private parsePortfolioItem(item: any) {
    if (!item) return item;
    return {
      ...item,
      tech_stack: this.parseJsonField(item.tech_stack, []),
      images: this.parseJsonField(item.images, []),
    };
  }

  private parseJsonField(value: any, fallback: any) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return value;
  }
}
