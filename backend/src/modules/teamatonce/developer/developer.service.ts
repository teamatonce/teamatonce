import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReviewsService } from '../reviews/reviews.service';
import {
  PerformanceMetricsDto,
  DeveloperReviewDto,
  DeveloperAchievementDto,
  SkillRatingDto,
  DeveloperProfileDto,
  UpdateDeveloperProfileDto,
  DashboardStatsDto,
  AIMatchedProjectDto,
} from './dto/developer.dto';

@Injectable()
export class DeveloperService {
  constructor(
    private readonly db: DatabaseService,
    private readonly reviewsService: ReviewsService,
  ) {}

  /**
   * Get dashboard stats (aggregated data for developer dashboard)
   */
  async getDashboardStats(userId: string): Promise<DashboardStatsDto> {
    // Get projects where developer is a member via project_members table
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    // Get all project IDs
    const projectIds = projectMemberships.map((pm: any) => pm.project_id);

    // Fetch project details
    const allProjects: any[] = [];
    for (const projectId of projectIds) {
      const project = await this.db.findOne('projects', { id: projectId });
      if (project && !project.deleted_at) {
        allProjects.push(project);
      }
    }

    const completedProjects = allProjects.filter((p: any) => p.status === 'completed');
    const activeProjects = allProjects.filter((p: any) =>
      ['active', 'in_progress', 'pending'].includes(p.status)
    );

    // Get payments for earnings calculation (payments for projects developer is part of)
    let payments: any[] = [];
    for (const projectId of projectIds) {
      const projectPayments = await this.db.findMany('payments', {
        project_id: projectId,
      });
      payments = payments.concat(projectPayments);
    }

    const completedPayments = payments.filter((p: any) => p.status === 'completed');
    const pendingPayments = payments.filter((p: any) => p.status === 'pending');

    // Calculate earnings
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonthEarnings = completedPayments
      .filter((p: any) => new Date(p.completed_at || p.created_at) >= thisMonthStart)
      .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    const lastMonthEarnings = completedPayments
      .filter((p: any) => {
        const date = new Date(p.completed_at || p.created_at);
        return date >= lastMonthStart && date <= lastMonthEnd;
      })
      .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    const totalEarnings = completedPayments
      .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    const pendingEarnings = pendingPayments
      .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    const growth = lastMonthEarnings > 0
      ? Math.round(((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100 * 10) / 10
      : 0;

    // Calculate total hours worked
    const totalHoursTracked = allProjects.reduce((sum: number, p: any) =>
      sum + (parseFloat(p.hours_worked) || 0), 0);

    // Get reviews for rating from project_feedback for developer's projects
    // Only count reviews FROM clients, not reviews the developer submitted
    let reviews: any[] = [];
    for (const projectId of projectIds) {
      const projectFeedback = await this.db.findMany('project_feedback', {
        project_id: projectId,
      });
      // Filter: only include reviews NOT submitted by this developer (i.e., from clients)
      reviews = reviews.concat(
        projectFeedback.filter((f: any) => !f.deleted_at && f.client_id !== userId)
      );
    }
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + (parseFloat(r.rating) || 0), 0) / reviews.length
      : 0;

    // Get upcoming milestones/deadlines from project_milestones
    let milestones: any[] = [];
    for (const projectId of projectIds) {
      const projectMilestones = await this.db.findMany('project_milestones', {
        project_id: projectId,
      });
      milestones = milestones.concat(projectMilestones);
    }
    const activeProjectIds = activeProjects.map((p: any) => p.id);

    const upcomingMilestones = milestones
      .filter((m: any) =>
        activeProjectIds.includes(m.project_id) &&
        m.status !== 'completed' &&
        new Date(m.due_date) > now
      )
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5);

    // Get developer skills
    const teamMember = await this.db.findOne('team_members', { user_id: userId });
    const skills = this.safeJsonParse(teamMember?.skills) || [];

    // Build skills verification (based on reviews mentioning skills)
    const skillsVerification = skills.slice(0, 6).map((skill: string) => {
      const skillReviews = reviews.filter((r: any) => {
        const reviewSkills = this.safeJsonParse(r.skills) || [];
        return reviewSkills.includes(skill);
      });
      return {
        skill,
        verified: skillReviews.length >= 2,
        level: skillReviews.length >= 5 ? 'Expert' : skillReviews.length >= 2 ? 'Intermediate' : 'Pending',
      };
    });

    return {
      earnings: {
        thisMonth: Math.round(thisMonthEarnings / 100 * 100) / 100,
        lastMonth: Math.round(lastMonthEarnings / 100 * 100) / 100,
        total: Math.round(totalEarnings / 100 * 100) / 100,
        pending: Math.round(pendingEarnings / 100 * 100) / 100,
        growth,
      },
      stats: {
        activeProjects: activeProjects.length,
        completedProjects: completedProjects.length,
        totalHoursTracked: Math.round(totalHoursTracked),
        averageRating: Math.round(avgRating * 10) / 10,
      },
      activeProjects: await Promise.all(activeProjects.slice(0, 5).map(async (p: any) => {
        const projectMilestones = milestones.filter((m: any) => m.project_id === p.id);
        const completedMilestones = projectMilestones.filter((m: any) => m.status === 'completed');
        const progress = projectMilestones.length > 0
          ? Math.round((completedMilestones.length / projectMilestones.length) * 100)
          : 0;

        return {
          id: p.id,
          name: p.name,
          clientName: p.client_name || 'Client',
          progress,
          dueDate: p.end_date || '',
          status: p.status,
        };
      })),
      upcomingDeadlines: await Promise.all(upcomingMilestones.map(async (m: any) => {
        const project = allProjects.find((p: any) => p.id === m.project_id);
        const dueDate = new Date(m.due_date);
        const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          project: project?.name || 'Unknown Project',
          milestone: m.title,
          dueDate: m.due_date,
          daysLeft,
        };
      })),
      skillsVerification,
    };
  }

  /**
   * Get AI-matched projects for the developer
   */
  async getMatchedProjects(userId: string, limit: number = 10): Promise<AIMatchedProjectDto[]> {
    // Get developer skills
    const teamMember = await this.db.findOne('team_members', { user_id: userId });
    const companyTeamMember = await this.db.findOne('company_team_members', { user_id: userId });
    const memberData = teamMember || companyTeamMember;
    const developerSkills = this.safeJsonParse(memberData?.skills) || [];

    // Get open/planning projects
    const openProjects = await this.db.findMany('projects', {});
    const availableProjects = openProjects.filter((p: any) =>
      (p.status === 'planning' || p.status === 'open') && !p.deleted_at
    );

    // Get projects developer is already part of
    const memberProjects = await this.db.findMany('project_members', {
      user_id: userId,
    });
    const memberProjectIds = new Set(memberProjects.map((pm: any) => pm.project_id));

    // Filter out projects the developer is already part of
    const filteredProjects = availableProjects.filter((p: any) =>
      !memberProjectIds.has(p.id)
    );

    // Calculate match percentage and sort
    const matchedProjects = await Promise.all(filteredProjects.map(async (p: any) => {
      const projectSkills = this.safeJsonParse(p.tech_stack) || [];

      // Calculate match percentage based on skill overlap
      const matchingSkills = developerSkills.filter((skill: string) =>
        projectSkills.some((ps: string) =>
          ps.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(ps.toLowerCase())
        )
      );
      const matchPercentage = projectSkills.length > 0
        ? Math.round((matchingSkills.length / projectSkills.length) * 100)
        : 50; // Default if no skills listed

      // Count proposals for this project
      const projectProposals = await this.db.findMany('project_proposals', {
        project_id: p.id,
      });

      return {
        id: p.id,
        title: p.name,
        description: p.description || '',
        clientName: 'Client', // Client info not available without users table
        clientRating: 4.5, // Default rating
        budget: {
          min: parseFloat(p.estimated_cost) || 0,
          max: parseFloat(p.estimated_cost) || 0,
          type: 'fixed',
        },
        duration: p.estimated_duration_days ? `${p.estimated_duration_days} days` : 'TBD',
        requiredSkills: projectSkills,
        matchPercentage: Math.min(matchPercentage + 20, 100), // Boost a bit
        postedDate: p.created_at,
        proposalsCount: projectProposals.length,
        status: p.status,
        category: p.project_type || 'General',
      };
    }));

    // Sort by match percentage descending
    return matchedProjects
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, limit);
  }

  /**
   * Get developer performance metrics
   */
  async getPerformanceMetrics(userId: string): Promise<PerformanceMetricsDto> {
    // Get projects where developer is a member via project_members table
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    const projectIdsFromMembers = projectMemberships.map((pm: any) => pm.project_id);

    // Also get projects where the developer's company is assigned via assigned_company_id
    const userCompanies = await this.db.findMany('company_team_members', {
      user_id: userId,
      status: 'active',
    });

    let projectIdsFromCompany: string[] = [];
    for (const company of userCompanies) {
      const companyProjects = await this.db.findMany('projects', {
        assigned_company_id: company.company_id,
        deleted_at: null,
      });
      projectIdsFromCompany = projectIdsFromCompany.concat(companyProjects.map((p: any) => p.id));
    }

    // Combine and dedupe project IDs
    const projectIds = [...new Set([...projectIdsFromMembers, ...projectIdsFromCompany])];

    // Fetch completed project details
    const projects: any[] = [];
    for (const projectId of projectIds) {
      const project = await this.db.findOne('projects', { id: projectId });
      if (project && project.status === 'completed' && !project.deleted_at) {
        projects.push(project);
      }
    }

    // Get reviews (feedback) for developer's projects
    // Only count reviews FROM clients, not reviews the developer submitted
    let reviews: any[] = [];
    for (const projectId of projectIds) {
      const projectFeedback = await this.db.findMany('project_feedback', {
        project_id: projectId,
      });
      // Filter: only include reviews NOT submitted by this developer (i.e., from clients)
      reviews = reviews.concat(
        projectFeedback.filter((f: any) => !f.deleted_at && f.client_id !== userId)
      );
    }

    // Calculate metrics
    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? reviews.reduce((sum: number, r: any) => sum + (parseFloat(r.rating) || 0), 0) / totalReviews
      : 0;

    // Calculate on-time delivery (projects completed before or on due date)
    const onTimeProjects = projects.filter((p: any) => {
      if (!p.completed_at || !p.end_date) return false;
      return new Date(p.completed_at) <= new Date(p.end_date);
    });
    const onTimeDelivery = projects.length > 0
      ? Math.round((onTimeProjects.length / projects.length) * 100)
      : 100;

    // Get payments for earnings calculation (payments for projects developer is part of)
    let payments: any[] = [];
    for (const projectId of projectIds) {
      const projectPayments = await this.db.findMany('payments', {
        project_id: projectId,
        status: 'completed',
      });
      payments = payments.concat(projectPayments);
    }

    const totalEarnings = payments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    // Calculate monthly earnings for last 12 months (raw values in cents)
    const monthlyEarningsRaw = this.calculateMonthlyData(payments, 'amount');
    // Convert monthly earnings from cents to dollars
    const monthlyEarnings = monthlyEarningsRaw.map(val => Math.round(val / 100 * 100) / 100);
    const hoursWorked = this.calculateMonthlyData(projects, 'hours_worked');

    return {
      rating: Math.round(avgRating * 10) / 10,
      totalReviews,
      projectsCompleted: projects.length,
      onTimeDelivery,
      codeQuality: avgRating, // Using overall rating as code quality for now
      clientSatisfaction: avgRating,
      responseTime: '2 hours', // Would need actual tracking for this
      totalEarnings: Math.round(totalEarnings / 100 * 100) / 100, // Convert cents to dollars
      monthlyEarnings,
      hoursWorked,
    };
  }

  /**
   * Get developer reviews
   * Returns reviews FROM clients about this developer (not reviews the developer submitted)
   */
  async getDeveloperReviews(userId: string, limit?: number): Promise<DeveloperReviewDto[]> {
    // Get projects where developer is a member via project_members
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    const projectIdsFromMembers = projectMemberships.map((pm: any) => pm.project_id);

    // Also get projects where the developer's company is assigned via assigned_company_id
    const userCompanies = await this.db.findMany('company_team_members', {
      user_id: userId,
      status: 'active',
    });

    let projectIdsFromCompany: string[] = [];
    for (const company of userCompanies) {
      const companyProjects = await this.db.findMany('projects', {
        assigned_company_id: company.company_id,
        deleted_at: null,
      });
      projectIdsFromCompany = projectIdsFromCompany.concat(companyProjects.map((p: any) => p.id));
    }

    // Combine and dedupe project IDs
    const projectIds = [...new Set([...projectIdsFromMembers, ...projectIdsFromCompany])];

    // Get feedback from all projects, but only from clients (not from this developer)
    let reviews: any[] = [];
    for (const projectId of projectIds) {
      const projectFeedback = await this.db.findMany('project_feedback', {
        project_id: projectId,
      });
      // Filter: only include reviews NOT submitted by this developer (i.e., from clients)
      // client_id in project_feedback is the reviewer's user ID
      reviews = reviews.concat(
        projectFeedback.filter((f: any) => !f.deleted_at && f.client_id !== userId)
      );
    }

    // Sort by date descending and apply limit
    const sortedReviews = reviews
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit || 10);

    // Get project details and reviewer name for each review
    const reviewDtos: DeveloperReviewDto[] = [];
    for (const review of sortedReviews) {
      const project = await this.db.findOne('projects', { id: review.project_id });

      // Get reviewer's name from auth service
      let reviewerName = 'Client';
      try {
        const reviewerResponse = await this.db.getUserById(review.client_id);
        const reviewer = (reviewerResponse as any)?.user || reviewerResponse;
        reviewerName = reviewer?.fullName || reviewer?.name || 'Client';
      } catch {
        // Fallback to 'Client' if user not found
      }

      reviewDtos.push({
        id: review.id,
        clientName: reviewerName,
        rating: parseFloat(review.rating) || 0,
        comment: review.content || '',
        projectTitle: project?.name || 'Unknown Project',
        date: review.created_at,
        skills: [], // Skills not tracked in project_feedback
      });
    }

    return reviewDtos;
  }

  /**
   * Get developer achievements
   */
  async getAchievements(userId: string): Promise<DeveloperAchievementDto[]> {
    // Get projects where developer is a member via project_members
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    const projectIdsFromMembers = projectMemberships.map((pm: any) => pm.project_id);

    // Also get projects where the developer's company is assigned via assigned_company_id
    const userCompanies = await this.db.findMany('company_team_members', {
      user_id: userId,
      status: 'active',
    });

    let projectIdsFromCompany: string[] = [];
    for (const company of userCompanies) {
      const companyProjects = await this.db.findMany('projects', {
        assigned_company_id: company.company_id,
        deleted_at: null,
      });
      projectIdsFromCompany = projectIdsFromCompany.concat(companyProjects.map((p: any) => p.id));
    }

    // Combine and dedupe project IDs
    const projectIds = [...new Set([...projectIdsFromMembers, ...projectIdsFromCompany])];

    // Fetch completed project details
    const projects: any[] = [];
    for (const projectId of projectIds) {
      const project = await this.db.findOne('projects', { id: projectId });
      if (project && project.status === 'completed' && !project.deleted_at) {
        projects.push(project);
      }
    }

    const defaultAchievements: DeveloperAchievementDto[] = [];

    if (projects.length >= 1) {
      defaultAchievements.push({
        id: 'first-project',
        title: 'First Project',
        description: 'Completed your first project',
        icon: 'rocket',
        color: 'blue',
        earned: projects[0]?.completed_at || new Date().toISOString(),
      });
    }

    if (projects.length >= 5) {
      defaultAchievements.push({
        id: 'rising-star',
        title: 'Rising Star',
        description: 'Completed 5 projects',
        icon: 'star',
        color: 'yellow',
        earned: projects[4]?.completed_at || new Date().toISOString(),
      });
    }

    if (projects.length >= 10) {
      defaultAchievements.push({
        id: 'veteran',
        title: 'Veteran Developer',
        description: 'Completed 10 projects',
        icon: 'trophy',
        color: 'gold',
        earned: projects[9]?.completed_at || new Date().toISOString(),
      });
    }

    return defaultAchievements;
  }

  /**
   * Get skill ratings
   */
  async getSkillRatings(userId: string): Promise<SkillRatingDto[]> {
    // Get developer's skills from team_members or company_team_members
    const teamMember = await this.db.findOne('team_members', { user_id: userId });
    const companyTeamMember = await this.db.findOne('company_team_members', { user_id: userId });

    const memberData = teamMember || companyTeamMember;
    const developerSkills = this.safeJsonParse(memberData?.skills) || [];

    // Get projects where developer is a member via project_members
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    const projectIdsFromMembers = projectMemberships.map((pm: any) => pm.project_id);

    // Also get projects where the developer's company is assigned via assigned_company_id
    const userCompanies = await this.db.findMany('company_team_members', {
      user_id: userId,
      status: 'active',
    });

    let projectIdsFromCompany: string[] = [];
    for (const company of userCompanies) {
      const companyProjects = await this.db.findMany('projects', {
        assigned_company_id: company.company_id,
        deleted_at: null,
      });
      projectIdsFromCompany = projectIdsFromCompany.concat(companyProjects.map((p: any) => p.id));
    }

    // Combine and dedupe project IDs
    const projectIds = [...new Set([...projectIdsFromMembers, ...projectIdsFromCompany])];

    // Get feedback from all projects
    // Only count reviews FROM clients, not reviews the developer submitted
    let reviews: any[] = [];
    for (const projectId of projectIds) {
      const projectFeedback = await this.db.findMany('project_feedback', {
        project_id: projectId,
      });
      // Filter: only include reviews NOT submitted by this developer (i.e., from clients)
      reviews = reviews.concat(
        projectFeedback.filter((f: any) => !f.deleted_at && f.client_id !== userId)
      );
    }

    // Calculate average rating per skill based on reviews
    const skillRatings: SkillRatingDto[] = [];

    // Calculate overall average rating from reviews
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + (parseFloat(r.rating) || 0), 0) / reviews.length
      : 0;

    // Create skill ratings for each developer skill
    for (const skill of developerSkills) {
      skillRatings.push({
        skill,
        rating: Math.round(avgRating * 10) / 10, // Use average rating for all skills
        reviews: reviews.length,
      });
    }

    // Sort by rating descending
    return skillRatings.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Get portfolio items (completed projects)
   */
  async getPortfolioItems(userId: string, limit: number = 10): Promise<any[]> {
    // Get projects where developer is a member via project_members table
    const projectMemberships = await this.db.findMany('project_members', {
      user_id: userId,
      member_type: 'seller',
    });

    const projectIdsFromMembers = projectMemberships.map((pm: any) => pm.project_id);

    // Also get projects where the developer's company is assigned via assigned_company_id
    const userCompanies = await this.db.findMany('company_team_members', {
      user_id: userId,
      status: 'active',
    });

    let projectIdsFromCompany: string[] = [];
    for (const company of userCompanies) {
      const companyProjects = await this.db.findMany('projects', {
        assigned_company_id: company.company_id,
        deleted_at: null,
      });
      projectIdsFromCompany = projectIdsFromCompany.concat(companyProjects.map((p: any) => p.id));
    }

    // Combine and dedupe project IDs
    const projectIds = [...new Set([...projectIdsFromMembers, ...projectIdsFromCompany])];

    // Fetch completed project details
    const completedProjects: any[] = [];
    for (const projectId of projectIds) {
      const project = await this.db.findOne('projects', { id: projectId });
      if (project && (project.status === 'completed' || project.status === 'ended') && !project.deleted_at) {
        completedProjects.push(project);
      }
    }

    // Sort by completion date (most recent first) and apply limit
    const sortedProjects = completedProjects
      .sort((a: any, b: any) => {
        const dateA = new Date(a.completed_at || a.updated_at).getTime();
        const dateB = new Date(b.completed_at || b.updated_at).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);

    // Transform to portfolio item format
    const portfolioItems = await Promise.all(sortedProjects.map(async (project: any) => {
      // Get client name
      let clientName = 'Client';
      if (project.client_id) {
        try {
          const clientResponse = await this.db.getUserById(project.client_id);
          const client = (clientResponse as any)?.user || clientResponse;
          clientName = client?.fullName || client?.name || 'Client';
        } catch {
          // Fallback to 'Client' if user not found
        }
      }

      // Parse tech stack for technologies
      const technologies = this.safeJsonParse(project.tech_stack) || [];

      return {
        id: project.id,
        title: project.name,
        description: project.description || `Project completed for ${clientName}`,
        technologies,
        completedDate: project.completed_at || project.actual_completion_date || project.updated_at,
        clientName,
        projectUrl: project.repository_url || null,
      };
    }));

    return portfolioItems;
  }

  /**
   * Get developer profile
   */
  async getDeveloperProfile(userId: string): Promise<DeveloperProfileDto> {
    // Get actual user data from auth service (primary source for name/email)
    const databaseUser = await this.db.getUserById(userId);

    // Get team member info (for developer-specific data)
    const teamMember = await this.db.findOne('team_members', { user_id: userId });

    // Also check company_team_members for more complete data
    const companyTeamMember = await this.db.findOne('company_team_members', { user_id: userId });

    // Use team_members or company_team_members data
    const memberData = teamMember || companyTeamMember;

    // Cast databaseUser to any to access dynamic properties
    // database returns { success: true, user: {...} }
    const userResponse = databaseUser as any;
    const user = userResponse?.user || userResponse;
    const metadata = user?.metadata || {};

    // Get name from database user first (fullName is the primary field), then fall back to member data
    const userName = user?.fullName || metadata?.full_name || user?.name ||
                     memberData?.display_name || memberData?.name || '';
    const userEmail = user?.email || memberData?.email || '';

    if (!memberData && !databaseUser) {
      // Return minimal profile with just userId if no data exists
      return {
        id: userId,
        name: '',
        email: '',
        avatar: null,
        title: '',
        bio: '',
        location: '',
        timezone: '',
        skills: [],
        hourlyRate: 0,
        availability: 'available',
        memberSince: new Date().toISOString(),
      };
    }

    return {
      id: userId,
      name: userName,
      email: userEmail,
      avatar: metadata?.avatar || user?.avatar || user?.avatar_url || memberData?.profile_image || memberData?.avatar_url || null,
      title: memberData?.title || '', // Use title field, not role
      bio: memberData?.bio || '',
      location: memberData?.location || '',
      timezone: memberData?.timezone || '',
      skills: this.safeJsonParse(memberData?.skills) || [],
      hourlyRate: parseFloat(memberData?.hourly_rate) || 0,
      availability: memberData?.availability_status || memberData?.availability || 'available',
      memberSince: memberData?.created_at || user?.created_at || new Date().toISOString(),
      reputationScore: await this.reviewsService.getReputationScore(userId),
    };
  }

  /**
   * Update developer profile
   */
  async updateDeveloperProfile(
    userId: string,
    data: UpdateDeveloperProfileDto,
  ): Promise<DeveloperProfileDto> {
    // Update team member record if exists
    const teamMember = await this.db.findOne('team_members', { user_id: userId });
    if (teamMember) {
      const memberUpdates: any = {};
      if (data.name) memberUpdates.display_name = data.name;
      if (data.title) memberUpdates.role = data.title;
      if (data.bio) memberUpdates.bio = data.bio;
      if (data.location) memberUpdates.location = data.location;
      if (data.timezone) memberUpdates.timezone = data.timezone;
      if (data.skills) memberUpdates.skills = JSON.stringify(data.skills);
      if (data.hourlyRate !== undefined) memberUpdates.hourly_rate = data.hourlyRate;
      if (data.availability) memberUpdates.availability_status = data.availability;

      if (Object.keys(memberUpdates).length > 0) {
        await this.db.update('team_members', { id: teamMember.id }, memberUpdates);
      }
    }

    // Also update company_team_members record if exists
    const companyTeamMember = await this.db.findOne('company_team_members', { user_id: userId });
    if (companyTeamMember) {
      const memberUpdates: any = {};
      if (data.name) memberUpdates.name = data.name;
      if (data.title) memberUpdates.title = data.title;
      if (data.bio) memberUpdates.bio = data.bio;
      if (data.location) memberUpdates.location = data.location;
      if (data.timezone) memberUpdates.timezone = data.timezone;
      if (data.skills) memberUpdates.skills = JSON.stringify(data.skills);
      if (data.hourlyRate !== undefined) memberUpdates.hourly_rate = data.hourlyRate;
      if (data.availability) memberUpdates.availability = data.availability;

      if (Object.keys(memberUpdates).length > 0) {
        await this.db.update('company_team_members', { id: companyTeamMember.id }, memberUpdates);
      }
    }

    return this.getDeveloperProfile(userId);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private calculateMonthlyData(items: any[], field: string): number[] {
    const monthlyData = new Array(12).fill(0);
    const now = new Date();

    for (const item of items) {
      const date = new Date(item.created_at || item.completed_at);
      const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());

      if (monthsAgo >= 0 && monthsAgo < 12) {
        const index = 11 - monthsAgo; // Most recent month is at index 11
        monthlyData[index] += parseFloat(item[field]) || 0;
      }
    }

    return monthlyData;
  }

  private safeJsonParse(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
