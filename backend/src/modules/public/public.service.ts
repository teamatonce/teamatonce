import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ReviewsService } from '../teamatonce/reviews/reviews.service';

/**
 * Public Service
 * Handles public-facing data for the landing page
 * No authentication required for these endpoints
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly db: DatabaseService,
    private readonly reviewsService: ReviewsService,
  ) {}

  /**
   * Get featured categories for the landing page
   * Categories are derived from skill categories with project counts
   */
  async getFeaturedCategories(limit = 8): Promise<any[]> {
    // Define main categories with their slugs
    // Categories matching frontend skills.ts
    const categories = [
      { name: 'Graphics & Design', slug: 'graphics-design', icon: 'Palette' },
      { name: 'Digital Marketing', slug: 'digital-marketing', icon: 'Megaphone' },
      { name: 'Writing & Translation', slug: 'writing-translation', icon: 'Pencil' },
      { name: 'Video & Animation', slug: 'video-animation', icon: 'Video' },
      { name: 'Music & Audio', slug: 'music-audio', icon: 'Music' },
      { name: 'Programming & Tech', slug: 'programming-tech', icon: 'Code' },
      { name: 'Business', slug: 'business', icon: 'Briefcase' },
      { name: 'Data & Analytics', slug: 'data-analytics', icon: 'BarChart' },
      { name: 'Photography', slug: 'photography', icon: 'Camera' },
      { name: 'Lifestyle', slug: 'lifestyle', icon: 'Heart' },
      { name: 'AI Services', slug: 'ai-services', icon: 'Bot' },
    ];

    // Get counts for each category based on projects
    const enrichedCategories = await Promise.all(
      categories.slice(0, limit).map(async (category) => {
        // Count projects that have relevant tech stack
        const allProjects = await this.db.findMany('projects', {
          deleted_at: null,
        });

        // Count sellers (companies) that have relevant skills
        const allCompanyMembers = await this.db.findMany('company_team_members', {
          deleted_at: null,
          status: 'active',
        });

        const categoryKeywords = this.getCategoryKeywords(category.slug);

        // Count sellers with matching skills
        let sellersCount = 0;
        for (const member of allCompanyMembers) {
          const skills = this.safeJsonParse(member.skills) || [];
          const hasMatchingSkill = skills.some((skill: string) =>
            categoryKeywords.some(keyword =>
              skill.toLowerCase().includes(keyword.toLowerCase())
            )
          );
          if (hasMatchingSkill) sellersCount++;
        }

        return {
          id: category.slug,
          name: category.name,
          slug: category.slug,
          icon: category.icon,
          developersCount: sellersCount,
          jobsCount: allProjects.filter((p: any) => {
            const techStack = this.safeJsonParse(p.tech_stack) || [];
            const frameworks = this.safeJsonParse(p.frameworks) || [];
            const allTech = [...techStack, ...frameworks];
            return allTech.some((tech: string) =>
              categoryKeywords.some(keyword =>
                tech.toLowerCase().includes(keyword.toLowerCase())
              )
            );
          }).length,
        };
      })
    );

    return enrichedCategories;
  }

  /**
   * Get featured/top-rated sellers for the landing page
   */
  async getFeaturedSellers(limit = 4): Promise<any[]> {
    // Get all active companies
    const companies = await this.db.findMany('developer_companies', {
      is_active: true,
      deleted_at: null,
    });

    // Enrich with ratings and project data
    const enrichedSellers = await Promise.all(
      companies.map(async (company: any) => {
        // Get company owner/primary member
        const primaryMember = await this.db.findOne('company_team_members', {
          company_id: company.id,
          is_owner: true,
        });

        if (!primaryMember) return null;

        // Get completed projects count for this company
        const completedProjects = await this.db.findMany('projects', {
          assigned_company_id: company.id,
          status: 'completed',
          deleted_at: null,
        });

        // Get all projects for this company for reviews
        const allProjects = await this.db.findMany('projects', {
          assigned_company_id: company.id,
          deleted_at: null,
        });

        const projectIds = allProjects.map((p: any) => p.id);

        // Get reviews/feedback for seller's projects
        let reviews: any[] = [];
        for (const projectId of projectIds) {
          const projectFeedback = await this.db.findMany('project_feedback', {
            project_id: projectId,
            deleted_at: null,
          });
          // Only include client reviews (not seller's own reviews)
          reviews = reviews.concat(
            projectFeedback.filter((f: any) => f.client_id !== primaryMember.user_id)
          );
        }

        const avgRating = reviews.length > 0
          ? reviews.reduce((sum: number, r: any) => sum + (parseFloat(r.rating) || 0), 0) / reviews.length
          : 0; // No default rating - show actual reviews count

        // Get skills from company profile (use new profile_skills if available, fallback to member skills)
        const profileSkills = this.safeJsonParse(company.profile_skills) || [];
        const memberSkills = this.safeJsonParse(primaryMember.skills) || [];
        const skills = profileSkills.length > 0 ? profileSkills : memberSkills;

        // Format location from business_address
        const businessAddress = this.safeJsonParse(company.business_address);
        const location = businessAddress
          ? [businessAddress.city, businessAddress.state, businessAddress.country].filter(Boolean).join(', ')
          : 'Remote';

        return {
          id: company.id,
          name: company.display_name || company.company_name || 'Unnamed Seller',
          title: company.professional_title || primaryMember.role || 'Software Developer',
          tagline: company.tagline || '',
          avatar: company.logo_url || primaryMember.avatar_url || null,
          coverImage: company.cover_image || null,
          rating: Math.round(avgRating * 10) / 10,
          reviewsCount: reviews.length,
          hourlyRate: company.hourly_rate || primaryMember.hourly_rate || 50,
          skills: skills.slice(0, 5),
          location: location,
          availability: company.availability || primaryMember.availability || 'available',
          completedProjects: company.completed_projects || completedProjects.length,
          bio: company.description || null,
          responseTime: company.response_time || '< 1 hour',
          successRate: company.success_rate || (completedProjects.length > 0 ? 95 : 100),
          verified: company.profile_verified || company.is_verified || false,
          topRated: company.profile_top_rated || false,
        };
      })
    );

    // Filter out null entries and sort by rating (desc) then completed projects (desc)
    const validSellers = enrichedSellers
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.completedProjects - a.completedProjects;
      })
      .slice(0, limit);

    return validSellers;
  }

  /**
   * Get seller by ID with full details including reviews
   */
  async getSellerById(id: string): Promise<any | null> {
    // Get the company
    const company = await this.db.findOne('developer_companies', {
      id,
      is_active: true,
      deleted_at: null,
    });

    if (!company) return null;

    // Get company owner/primary member
    const primaryMember = await this.db.findOne('company_team_members', {
      company_id: company.id,
      is_owner: true,
    });

    if (!primaryMember) return null;

    // Get completed projects count for this company
    const completedProjects = await this.db.findMany('projects', {
      assigned_company_id: company.id,
      status: 'completed',
      deleted_at: null,
    });

    // Get all projects for this company for reviews
    const allProjects = await this.db.findMany('projects', {
      assigned_company_id: company.id,
      deleted_at: null,
    });

    const projectIds = allProjects.map((p: any) => p.id);

    // Get reviews/feedback for seller's projects with full details
    let reviews: any[] = [];
    for (const projectId of projectIds) {
      const projectFeedback = await this.db.findMany('project_feedback', {
        project_id: projectId,
        deleted_at: null,
      });

      // Only include client reviews (not seller's own reviews)
      const clientReviews = projectFeedback.filter((f: any) => f.client_id !== primaryMember.user_id);

      // Enrich reviews with client details and project info
      for (const feedback of clientReviews) {
        const clientResult: any = await this.db.getUserById(feedback.reviewer_id || feedback.client_id);
        // Unwrap the response - database returns { success: true, user: {...} }
        const client = clientResult?.user || clientResult;
        const project = allProjects.find((p: any) => p.id === feedback.project_id);

        reviews.push({
          id: feedback.id,
          clientName: client?.fullName || client?.name || 'Anonymous Client',
          clientAvatar: client?.avatar_url || client?.avatarUrl || null,
          projectTitle: project?.name || 'Project',
          rating: parseFloat(feedback.rating) || 0,
          comment: feedback.content || feedback.comment || '',
          date: new Date(feedback.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        });
      }
    }

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
      : 0;

    // Get skills from company profile (use new profile_skills if available, fallback to member skills)
    const profileSkills = this.safeJsonParse(company.profile_skills) || [];
    const memberSkills = this.safeJsonParse(primaryMember.skills) || [];
    const skills = profileSkills.length > 0 ? profileSkills : memberSkills;

    // Get languages from company profile (use new profile_languages if available, fallback to member languages)
    const profileLanguages = this.safeJsonParse(company.profile_languages) || [];
    const memberLanguages = this.safeJsonParse(primaryMember.languages) || [];
    const languages = profileLanguages.length > 0 ? profileLanguages : memberLanguages;

    // Format location from business_address
    const businessAddress = this.safeJsonParse(company.business_address);
    const location = businessAddress
      ? [businessAddress.city, businessAddress.state, businessAddress.country].filter(Boolean).join(', ')
      : 'Remote';

    return {
      id: company.id,
      name: company.display_name || company.company_name || 'Unnamed Seller',
      title: company.professional_title || primaryMember.role || 'Software Developer',
      tagline: company.tagline || '',
      avatar: company.logo_url || primaryMember.avatar_url || null,
      coverImage: company.cover_image || null,
      rating: Math.round(avgRating * 10) / 10,
      reviewsCount: reviews.length,
      hourlyRate: company.hourly_rate || primaryMember.hourly_rate || 50,
      skills: skills,
      location: location,
      availability: company.availability || primaryMember.availability || 'available',
      completedProjects: company.completed_projects || completedProjects.length,
      totalEarnings: company.total_earnings || 0,
      successRate: company.success_rate || (completedProjects.length > 0 ? 95 : 100),
      onTimeDelivery: company.on_time_delivery || 100,
      bio: company.description || null,
      responseTime: company.response_time || '< 1 hour',
      timezone: company.timezone || 'UTC',
      languages: languages,
      education: this.safeJsonParse(company.profile_education) || [],
      certifications: this.safeJsonParse(company.profile_certifications) || [],
      experience: this.safeJsonParse(company.profile_experience) || [],
      portfolio: this.safeJsonParse(company.profile_portfolio) || [],
      socialLinks: {
        ...this.safeJsonParse(company.profile_social_links),
        website: company.website,
      },
      verified: company.profile_verified || company.is_verified || false,
      topRated: company.profile_top_rated || false,
      joinedDate: company.created_at,
      reviews: reviews, // Include actual reviews
      reputationScore: await this.reviewsService.getReputationScore(primaryMember.user_id),
    };
  }

  /**
   * Get featured jobs (projects open for proposals) for the landing page
   */
  async getFeaturedJobs(limit = 6): Promise<any[]> {
    // Get projects that are open for proposals (status = 'planning' and not assigned)
    const openProjects = await this.db.findMany('projects', {
      status: 'planning',
      deleted_at: null,
    });

    // Filter to only unassigned projects
    const availableProjects = openProjects.filter(
      (p: any) => !p.assigned_company_id
    );
    console.log('availprojects',availableProjects);
    // Enrich with client data
    const enrichedJobs = await Promise.all(
      availableProjects.slice(0, limit).map(async (project: any) => {
        // Get client user info using auth API
        const clientResult: any = await this.db.getUserById(project.client_id);
        // Unwrap the response - database returns { success: true, user: {...} }
        const client = clientResult?.user || clientResult;
        const metadata = client?.metadata || {};

        // Count proposals
        const proposals = await this.db.findMany('project_proposals', {
          project_id: project.id,
        });

        const techStack = this.safeJsonParse(project.tech_stack) || [];
        const frameworks = this.safeJsonParse(project.frameworks) || [];
        const skills = [...techStack, ...frameworks].slice(0, 5);

        // Extract client name from various possible fields
        const clientName = client?.fullName || client?.name || metadata?.full_name || metadata?.username || client?.email?.split('@')[0] || 'Anonymous Client';

        // Parse requirements and other arrays from project
        const requirements = this.safeJsonParse(project.requirements) || [];
        const responsibilities = this.safeJsonParse(project.responsibilities) || [];
        const benefits = this.safeJsonParse(project.benefits) || [];

        return {
          id: project.id,
          title: project.name,
          company: clientName,
          companyLogo: metadata?.avatar || client?.avatar_url || client?.avatarUrl || null,
          description: project.description || '',
          type: project.project_type || 'contract',
          location: 'Remote',
          remote: true,
          salary: (project.budget_min || project.budget_max || project.estimated_cost) ? {
            min: parseFloat(project.budget_min) || parseFloat(project.estimated_cost) || 0,
            max: parseFloat(project.budget_max) || parseFloat(project.estimated_cost) || 0,
            currency: project.currency || 'USD',
            period: 'project',
          } : null,
          skills,
          postedAt: project.created_at,
          deadline: project.expected_completion_date || null,
          applicationsCount: proposals.length,
          // Additional detail fields
          requirements,
          responsibilities,
          benefits,
          companyDescription: null,
        };
      })
    );

    // Sort by most recent first
    return enrichedJobs.sort((a, b) =>
      new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );
  }

  /**
   * Smart search for developers/sellers with relevance scoring
   * Provides semantic-like search using text matching and related terms
   */
  async searchDevelopers(params: {
    query?: string;
    skills?: string[];
    category?: string;
    minRate?: number;
    maxRate?: number;
    availability?: string;
    minRating?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      query = '',
      skills = [],
      category,
      minRate,
      maxRate,
      availability,
      minRating,
      page = 1,
      limit = 20,
    } = params;

    // Get all active companies
    const companies = await this.db.findMany('developer_companies', {
      is_active: true,
      deleted_at: null,
    });

    // Enrich with ratings and project data
    const enrichedSellers = await Promise.all(
      companies.map(async (company: any) => {
        // Get company owner/primary member
        const primaryMember = await this.db.findOne('company_team_members', {
          company_id: company.id,
          is_owner: true,
        });

        if (!primaryMember) return null;

        // Get completed projects count for this company
        const completedProjects = await this.db.findMany('projects', {
          assigned_company_id: company.id,
          status: 'completed',
          deleted_at: null,
        });

        // Get all projects for this company for reviews
        const allProjects = await this.db.findMany('projects', {
          assigned_company_id: company.id,
          deleted_at: null,
        });

        const projectIds = allProjects.map((p: any) => p.id);

        // Get reviews/feedback for seller's projects
        let reviews: any[] = [];
        for (const projectId of projectIds) {
          const projectFeedback = await this.db.findMany('project_feedback', {
            project_id: projectId,
            deleted_at: null,
          });
          reviews = reviews.concat(
            projectFeedback.filter((f: any) => f.client_id !== primaryMember.user_id)
          );
        }

        const avgRating = reviews.length > 0
          ? reviews.reduce((sum: number, r: any) => sum + (parseFloat(r.rating) || 0), 0) / reviews.length
          : 0; // No default rating - show actual reviews count

        // Get skills from company profile (use new profile_skills if available, fallback to member skills)
        const profileSkills = this.safeJsonParse(company.profile_skills) || [];
        const memberSkills = this.safeJsonParse(primaryMember.skills) || [];
        const skills = profileSkills.length > 0 ? profileSkills : memberSkills;

        // Format location from business_address
        const businessAddress = this.safeJsonParse(company.business_address);
        const location = businessAddress
          ? [businessAddress.city, businessAddress.state, businessAddress.country].filter(Boolean).join(', ')
          : 'Remote';

        const professionalTitle = company.professional_title || primaryMember.role || 'Software Developer';

        return {
          id: company.id,
          name: company.display_name || company.company_name || 'Unnamed Seller',
          title: professionalTitle,
          tagline: company.tagline || '',
          avatar: company.logo_url || primaryMember.avatar_url || null,
          coverImage: company.cover_image || null,
          rating: Math.round(avgRating * 10) / 10,
          reviewsCount: reviews.length,
          hourlyRate: company.hourly_rate || primaryMember.hourly_rate || 50,
          skills: skills,
          location: location,
          availability: company.availability || primaryMember.availability || 'available',
          completedProjects: company.completed_projects || completedProjects.length,
          bio: company.description || null,
          responseTime: company.response_time || '< 1 hour',
          successRate: company.success_rate || (completedProjects.length > 0 ? 95 : 100),
          verified: company.profile_verified || company.is_verified || false,
          topRated: company.profile_top_rated || false,
          // For search scoring
          _searchData: {
            name: (company.display_name || company.company_name || '').toLowerCase(),
            title: professionalTitle.toLowerCase(),
            tagline: (company.tagline || '').toLowerCase(),
            bio: (company.description || '').toLowerCase(),
            skills: skills.map((s: any) => typeof s === 'string' ? s.toLowerCase() : (s.name || '').toLowerCase()),
          },
        };
      })
    );

    // Filter out null entries and add relevance score field
    let results: Array<{
      id: any;
      name: string;
      title: string;
      avatar: any;
      rating: number;
      reviewsCount: number;
      hourlyRate: number;
      skills: string[];
      location: string;
      availability: string;
      completedProjects: number;
      bio: string | null;
      responseTime: string;
      successRate: number;
      _searchData: { name: string; title: string; bio: string; skills: string[] };
      _relevanceScore?: number;
    }> = enrichedSellers.filter((s): s is NonNullable<typeof s> => s !== null);

    // Apply search query with relevance scoring
    if (query && query.trim()) {
      const searchTerms = query.toLowerCase().trim().split(/\s+/);
      const relatedTerms = this.getRelatedSearchTerms(searchTerms);

      results = results.map(seller => {
        const score = this.calculateRelevanceScore(seller._searchData, searchTerms, relatedTerms);
        return { ...seller, _relevanceScore: score };
      }).filter(seller => (seller._relevanceScore || 0) > 0);

      // Sort by relevance score
      results.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));
    }

    // Apply skill filter
    if (skills && skills.length > 0) {
      const normalizedSkills = skills.map(s => s.toLowerCase());
      results = results.filter(seller => {
        const sellerSkills = seller._searchData.skills;
        return normalizedSkills.some(skill =>
          sellerSkills.some((ss: string) => ss.includes(skill) || skill.includes(ss))
        );
      });
    }

    // Apply category filter
    if (category) {
      const categoryKeywords = this.getCategoryKeywords(category);
      results = results.filter(seller => {
        const sellerSkills = seller._searchData.skills;
        return categoryKeywords.some(keyword =>
          sellerSkills.some((ss: string) => ss.includes(keyword.toLowerCase()))
        );
      });
    }

    // Apply rate filter
    if (minRate !== undefined) {
      results = results.filter(seller => seller.hourlyRate >= minRate);
    }
    if (maxRate !== undefined) {
      results = results.filter(seller => seller.hourlyRate <= maxRate);
    }

    // Apply availability filter
    if (availability) {
      results = results.filter(seller => seller.availability === availability);
    }

    // Apply rating filter
    if (minRating !== undefined) {
      results = results.filter(seller => seller.rating >= minRating);
    }

    // If no query, sort by rating and completed projects
    if (!query || !query.trim()) {
      results.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.completedProjects - a.completedProjects;
      });
    }

    // Get total before pagination
    const total = results.length;

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    // Remove internal search data from response
    const cleanResults = paginatedResults.map(seller => {
      const { _searchData, _relevanceScore, ...cleanSeller } = seller;
      // Limit skills to 5 for display
      return { ...cleanSeller, skills: cleanSeller.skills.slice(0, 5) };
    });

    return {
      data: cleanResults,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Calculate relevance score for a seller based on search terms
   */
  private calculateRelevanceScore(
    searchData: { name: string; title: string; bio: string; skills: string[] },
    searchTerms: string[],
    relatedTerms: Map<string, string[]>
  ): number {
    let score = 0;

    for (const term of searchTerms) {
      // Exact match in name (highest weight)
      if (searchData.name.includes(term)) {
        score += 50;
      }

      // Exact match in title (high weight)
      if (searchData.title.includes(term)) {
        score += 40;
      }

      // Exact match in skills (high weight)
      if (searchData.skills.some(skill => skill.includes(term))) {
        score += 35;
      }

      // Exact match in bio (medium weight)
      if (searchData.bio.includes(term)) {
        score += 20;
      }

      // Check related terms (semantic-like matching)
      const related = relatedTerms.get(term) || [];
      for (const relatedTerm of related) {
        if (searchData.skills.some(skill => skill.includes(relatedTerm))) {
          score += 25; // Related skill match
        }
        if (searchData.title.includes(relatedTerm)) {
          score += 20; // Related title match
        }
        if (searchData.bio.includes(relatedTerm)) {
          score += 10; // Related bio match
        }
      }
    }

    return score;
  }

  /**
   * Get related search terms for semantic-like matching
   */
  private getRelatedSearchTerms(searchTerms: string[]): Map<string, string[]> {
    const relatedTermsMap = new Map<string, string[]>();

    // Define related terms for common search queries
    const termRelations: Record<string, string[]> = {
      // Frontend
      'frontend': ['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'ui', 'ux'],
      'react': ['frontend', 'javascript', 'typescript', 'next.js', 'redux', 'web'],
      'vue': ['frontend', 'javascript', 'typescript', 'nuxt', 'web'],
      'angular': ['frontend', 'typescript', 'javascript', 'web'],

      // Backend
      'backend': ['node', 'python', 'java', 'api', 'server', 'database', 'express', 'nestjs'],
      'node': ['backend', 'javascript', 'express', 'nestjs', 'api', 'server'],
      'python': ['backend', 'django', 'flask', 'fastapi', 'data', 'machine learning', 'ai'],
      'java': ['backend', 'spring', 'api', 'enterprise'],

      // Full Stack
      'fullstack': ['frontend', 'backend', 'full stack', 'web', 'developer'],
      'full stack': ['frontend', 'backend', 'fullstack', 'web', 'developer'],

      // Mobile
      'mobile': ['ios', 'android', 'react native', 'flutter', 'app'],
      'ios': ['mobile', 'swift', 'apple', 'iphone', 'app'],
      'android': ['mobile', 'kotlin', 'java', 'app'],
      'flutter': ['mobile', 'dart', 'cross-platform', 'app'],
      'react native': ['mobile', 'javascript', 'cross-platform', 'app'],

      // Design
      'design': ['ui', 'ux', 'figma', 'photoshop', 'graphic', 'visual', 'logo'],
      'ui': ['design', 'ux', 'frontend', 'figma', 'interface', 'visual'],
      'ux': ['design', 'ui', 'user experience', 'research', 'prototype'],
      'graphic': ['design', 'illustrator', 'photoshop', 'visual', 'logo', 'brand'],

      // Data & AI
      'data': ['analytics', 'sql', 'python', 'visualization', 'science', 'analysis'],
      'ai': ['machine learning', 'python', 'deep learning', 'nlp', 'artificial intelligence'],
      'machine learning': ['ai', 'python', 'tensorflow', 'pytorch', 'data science'],

      // DevOps & Cloud
      'devops': ['aws', 'docker', 'kubernetes', 'ci/cd', 'cloud', 'infrastructure'],
      'aws': ['cloud', 'devops', 'azure', 'gcp', 'infrastructure'],
      'cloud': ['aws', 'azure', 'gcp', 'devops', 'infrastructure'],

      // Marketing
      'marketing': ['seo', 'social media', 'content', 'digital', 'advertising', 'ppc'],
      'seo': ['marketing', 'content', 'google', 'optimization', 'search'],

      // Writing
      'writing': ['content', 'copywriting', 'blog', 'article', 'technical'],
      'content': ['writing', 'copywriting', 'blog', 'marketing', 'social media'],

      // Video & Animation
      'video': ['editing', 'animation', 'youtube', 'premiere', 'after effects'],
      'animation': ['video', 'motion graphics', 'after effects', '2d', '3d'],
    };

    for (const term of searchTerms) {
      const related = termRelations[term] || [];
      relatedTermsMap.set(term, related);
    }

    return relatedTermsMap;
  }

  /**
   * Get testimonials from clients and developers for the landing page
   * Fetches high-rated public feedback
   */
  async getTestimonials(limit = 6): Promise<any[]> {
    // Get all public feedback with high ratings (4-5 stars)
    const allFeedback = await this.db.findMany('project_feedback', {
      deleted_at: null,
      is_public: true,
    });

    // Filter for high ratings (4-5 stars)
    const highRatedFeedback = allFeedback.filter((f: any) => f.rating >= 4);

    // Enrich feedback with user and project data
    const enrichedTestimonials = await Promise.all(
      highRatedFeedback.map(async (feedback: any) => {
        // Get the feedback author (client who gave the feedback)
        const authorResult: any = await this.db.getUserById(feedback.client_id);
        const author: any = authorResult?.user || authorResult;
        const metadata = author?.metadata || {};

        // Get project info
        const project = await this.db.findOne('projects', {
          id: feedback.project_id,
        });

        // Determine if this is from a client (feedback on developer's work)
        let role = 'Client';

        if (project) {
          // Check if the feedback author is the client
          if (project.client_id === feedback.client_id) {
            role = 'Client';
          }
        }

        // If no content or author, skip this testimonial
        if (!feedback.content || !author) return null;

        // Extract user name from various possible fields
        const userName = author?.fullName || author?.name || metadata?.full_name || metadata?.username || author?.email?.split('@')[0] || 'Anonymous';

        return {
          id: feedback.id,
          name: userName,
          role: role,
          company: metadata?.company || null,
          avatar: metadata?.avatar || author?.avatar_url || author?.avatarUrl || null,
          rating: feedback.rating,
          content: feedback.content,
          title: feedback.title || null,
          projectName: project?.name || null,
          createdAt: feedback.created_at,
        };
      })
    );

    // Filter out null entries and sort by rating (highest first), then by date (newest first)
    const validTestimonials = enrichedTestimonials
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, limit);

    return validTestimonials;
  }

  /**
   * Get published FAQs for the landing page
   */
  async getPublicFaqs(category?: string): Promise<any[]> {
    try {
      const query: any = {
        is_published: true,
        deleted_at: null,
      };

      if (category) {
        query.category = category;
      }

      const faqs = await this.db.findMany('faqs', query);

      // Sort by order_index and return only published, non-deleted FAQs
      return faqs
        .filter((faq: any) => faq.is_published && !faq.deleted_at)
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        .map((faq: any) => ({
          id: faq.id,
          question: faq.question,
          answer: faq.answer,
          category: faq.category || 'General',
        }));
    } catch (error) {
      console.error('Error fetching public FAQs:', error);
      return [];
    }
  }

  /**
   * Get platform statistics for the landing page
   */
  async getPlatformStats(): Promise<any> {
    const [companies, projects, users, completedProjects] = await Promise.all([
      this.db.findMany('developer_companies', { is_active: true, deleted_at: null }),
      this.db.findMany('projects', { deleted_at: null }),
      this.db.findMany('users', { deleted_at: null }),
      this.db.findMany('projects', { status: 'completed', deleted_at: null }),
    ]);

    const successRate = projects.length > 0
      ? Math.round((completedProjects.length / projects.length) * 100)
      : 95;

    return {
      totalDevelopers: companies.length,
      totalProjects: projects.length,
      totalClients: users.length,
      successRate: Math.max(successRate, 80), // Minimum 80%
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private safeJsonParse(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private getCategoryKeywords(slug: string): string[] {
    // Keywords matching the skill categories from skills.ts
    const keywordMap: Record<string, string[]> = {
      'graphics-design': ['logo', 'brand', 'illustration', 'ui', 'ux', 'design', 'photoshop', 'illustrator', 'figma', 'sketch', 'graphic', 'icon', 'banner', 'poster', '3d', 'modeling'],
      'digital-marketing': ['seo', 'marketing', 'social media', 'facebook', 'instagram', 'google ads', 'ppc', 'email marketing', 'content marketing', 'affiliate', 'influencer'],
      'writing-translation': ['writing', 'copywriting', 'content', 'blog', 'article', 'translation', 'proofreading', 'editing', 'technical writing', 'creative writing', 'script'],
      'video-animation': ['video', 'animation', 'motion graphics', 'after effects', 'premiere', 'youtube', 'explainer', 'whiteboard', '2d animation', '3d animation', 'editing'],
      'music-audio': ['music', 'audio', 'voice', 'podcast', 'mixing', 'mastering', 'sound design', 'jingle', 'composition', 'singing', 'voiceover'],
      'programming-tech': ['web', 'mobile', 'app', 'software', 'javascript', 'python', 'react', 'node', 'api', 'backend', 'frontend', 'full stack', 'database', 'devops', 'cloud'],
      'business': ['business', 'consulting', 'financial', 'accounting', 'legal', 'hr', 'project management', 'virtual assistant', 'data entry', 'market research'],
      'data-analytics': ['data', 'analytics', 'visualization', 'tableau', 'power bi', 'excel', 'sql', 'python', 'machine learning', 'statistics', 'reporting'],
      'photography': ['photography', 'photo editing', 'lightroom', 'portrait', 'product photography', 'real estate', 'food photography', 'retouching'],
      'lifestyle': ['fitness', 'nutrition', 'wellness', 'coaching', 'astrology', 'spiritual', 'relationship', 'gaming', 'travel'],
      'ai-services': ['ai', 'chatgpt', 'machine learning', 'nlp', 'computer vision', 'automation', 'chatbot', 'deep learning', 'neural', 'tensorflow', 'pytorch'],
    };

    return keywordMap[slug] || [];
  }
}
