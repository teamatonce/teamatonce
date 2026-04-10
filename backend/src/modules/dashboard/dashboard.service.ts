import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Dashboard Service for Team@Once Platform
 * Provides aggregated dashboard data for clients
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get comprehensive dashboard data for a user
   * @param userId - The user's ID
   * @param companyId - Optional company ID to filter projects
   */
  async getDashboardData(userId: string, companyId?: string) {
    try {
      this.logger.log(`Getting dashboard data for user ${userId}, company ${companyId || 'N/A'}`);

      // Get all projects - via multiple methods to ensure we find all relevant projects
      const projectMap = new Map();

      // Method 1: Get projects by company_id on projects table
      if (companyId) {
        const companyQuery = this.db.table('projects')
          .where('company_id', '=', companyId);
        const companyResult = await companyQuery.execute();
        const companyProjects = companyResult.data || [];
        this.logger.log(`Found ${companyProjects.length} projects by company_id ${companyId}`);
        companyProjects.forEach(p => projectMap.set(p.id, p));
      }

      // Method 2: Get projects where user is the client
      const clientQuery = this.db.table('projects')
        .where('client_id', '=', userId);
      const clientResult = await clientQuery.execute();
      const clientProjects = clientResult.data || [];
      this.logger.log(`Found ${clientProjects.length} projects by client_id ${userId}`);
      clientProjects.forEach(p => projectMap.set(p.id, p));

      // Method 3: Get projects through project_members table (user as member)
      const memberQuery = this.db.table('project_members')
        .where('user_id', '=', userId);
      const memberResult = await memberQuery.execute();
      const memberRecords = memberResult.data || [];
      this.logger.log(`Found ${memberRecords.length} project_members records for user ${userId}`);

      // Fetch each project by ID
      for (const member of memberRecords) {
        if (member.project_id && !projectMap.has(member.project_id)) {
          const projectQuery = this.db.table('projects')
            .where('id', '=', member.project_id)
            .limit(1);
          const projectResult = await projectQuery.execute();
          const project = projectResult.data?.[0];
          if (project) {
            projectMap.set(project.id, project);
          }
        }
      }

      // Convert to array and filter out deleted projects
      let projects = Array.from(projectMap.values()).filter(p => !p.deleted_at);

      this.logger.log(`Found ${projects.length} total projects for dashboard stats (after dedup & filter)`);

      // Calculate project statistics
      const activeProjects = projects.filter((p) => p.status === 'in_progress' || p.status === 'active').length;
      const completedProjects = projects.filter((p) => p.status === 'completed').length;
      const totalProjects = projects.length;

      // Get project IDs for queries
      const projectIds = projects.map((p) => p.id);

      // Calculate total spent from paid milestones
      let totalSpent = 0;
      if (projectIds.length > 0) {
        for (const projectId of projectIds) {
          // Query all milestones for this project
          const milestonesQuery = this.db.table('project_milestones')
            .where('project_id', '=', projectId);
          const milestonesResult = await milestonesQuery.execute();
          const allMilestones = milestonesResult.data || [];
          this.logger.log(`Project ${projectId}: Found ${allMilestones.length} milestones`);

          // Filter for paid milestones in JavaScript
          const paidMilestones = allMilestones.filter((m: any) =>
            m.payment_status === 'paid' && !m.deleted_at
          );
          this.logger.log(`Project ${projectId}: ${paidMilestones.length} paid milestones`);

          for (const milestone of paidMilestones) {
            const amount = parseFloat(milestone.milestone_amount || '0');
            this.logger.log(`Milestone ${milestone.id}: amount=${milestone.milestone_amount}, parsed=${amount}`);
            if (!isNaN(amount)) {
              totalSpent += amount;
            }
          }
        }
      }
      this.logger.log(`Calculated totalSpent from paid milestones: ${totalSpent}`);

      // Get team members count from project_members table
      const teamMemberIds = new Set<string>();

      if (projectIds.length > 0) {
        for (const projectId of projectIds) {
          // Get sellers from project_members table
          const membersQuery = this.db.table('project_members')
            .where('project_id', '=', projectId)
            .where('member_type', '=', 'seller');
          const membersResult = await membersQuery.execute();
          const members = (membersResult.data || []).filter((m: any) => !m.deleted_at);
          members.forEach((m: any) => teamMemberIds.add(m.user_id));
        }
      }

      // Also check assigned_team JSON field as fallback
      for (const project of projects) {
        try {
          const assignedTeam = JSON.parse(project.assigned_team || '[]');
          if (Array.isArray(assignedTeam)) {
            assignedTeam.forEach((id: string) => teamMemberIds.add(id));
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      const developersHired = teamMemberIds.size;

      // Calculate total hours tracked from project_members
      let totalHoursTracked = 0;
      if (projectIds.length > 0) {
        for (const projectId of projectIds) {
          const membersQuery = this.db.table('project_members')
            .where('project_id', '=', projectId);
          const membersResult = await membersQuery.execute();
          const members = (membersResult.data || []).filter((m: any) => !m.deleted_at);
          for (const member of members) {
            const hours = parseFloat(member.actual_hours || '0') + parseFloat(member.billable_hours || '0');
            if (!isNaN(hours)) {
              totalHoursTracked += hours;
            }
          }
        }
      }
      this.logger.log(`Calculated totalHoursTracked: ${totalHoursTracked}`);

      // Calculate average rating and total reviews from project feedback
      // Only count reviews FROM other users (developers), not reviews the client submitted
      let totalRating = 0;
      let totalReviews = 0;

      if (projectIds.length > 0) {
        // Get all feedbacks for user's projects, but only from other users (not self-reviews)
        for (const projectId of projectIds) {
          const feedbackQuery = this.db.table('project_feedback')
            .where('project_id', '=', projectId);
          const feedbackResult = await feedbackQuery.execute();
          // Filter: only include reviews NOT submitted by this user (reviews FROM developers)
          // client_id in project_feedback is the reviewer's user ID
          const feedbacks = (feedbackResult.data || []).filter((f: any) =>
            !f.deleted_at && f.client_id !== userId
          );
          for (const feedback of feedbacks) {
            if (feedback.rating) {
              totalRating += feedback.rating;
              totalReviews++;
            }
          }
        }
      }
      const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

      // Get recent activities (last 10)
      const activities = await /* TODO: replace client call */ this.db.client.query
        .from('activity_logs')
        .select('*')
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .limit(10)
        .execute();

      // Get notifications (last 10 unread)
      const notificationsQuery = this.db.table('notifications')
        .where('user_id', '=', userId)
        .where('is_read', '=', false)
        .orderBy('created_at', 'desc')
        .limit(10);
      const notificationsResult = await notificationsQuery.execute();
      const notifications = notificationsResult.data || [];

      return {
        stats: {
          activeProjects,
          completedProjects,
          totalProjects,
          totalSpent: Math.round(totalSpent * 100) / 100,
          developersHired,
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
          totalReviews,
          totalHoursTracked: Math.round(totalHoursTracked * 10) / 10,
        },
        recentProjects: projects
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 5)
          .map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            progress: project.progress_percentage || 0,
            startDate: project.start_date,
            expectedCompletion: project.expected_completion_date,
            estimatedCost: parseFloat(project.estimated_cost || '0'),
            actualCost: parseFloat(project.actual_cost || '0'),
            updatedAt: project.updated_at,
          })),
        recentActivities: (activities.data || []).map((activity) => ({
          id: activity.id,
          type: activity.activity_type,
          title: this.getActivityTitle(activity.activity_type),
          description: this.getActivityDescription(activity),
          timestamp: activity.created_at,
          projectId: activity.project_id,
          projectName: activity.metadata?.projectName || 'Project',
        })),
        notifications: notifications.map((notification) => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          createdAt: notification.created_at,
          isRead: notification.is_read,
          actionUrl: notification.action_url,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get dashboard data: ${error.message}`, error.stack);
      // Return empty structure on error
      return {
        stats: {
          activeProjects: 0,
          completedProjects: 0,
          totalProjects: 0,
          totalSpent: 0,
          developersHired: 0,
          averageRating: 0,
          totalReviews: 0,
          totalHoursTracked: 0,
        },
        recentProjects: [],
        recentActivities: [],
        notifications: [],
      };
    }
  }

  /**
   * Get reviews for a client (reviews FROM developers about the client)
   * @param userId - The client's user ID
   * @param companyId - Optional company ID to filter projects
   * @param limit - Maximum number of reviews to return
   */
  async getClientReviews(userId: string, companyId?: string, limit: number = 10) {
    try {
      this.logger.log(`Getting client reviews for user ${userId}, company ${companyId || 'N/A'}`);

      // Get all projects for this client (same logic as getDashboardData)
      const projectMap = new Map();

      if (companyId) {
        const companyQuery = this.db.table('projects')
          .where('company_id', '=', companyId);
        const companyResult = await companyQuery.execute();
        const companyProjects = companyResult.data || [];
        companyProjects.forEach(p => projectMap.set(p.id, p));
      }

      const clientQuery = this.db.table('projects')
        .where('client_id', '=', userId);
      const clientResult = await clientQuery.execute();
      const clientProjects = clientResult.data || [];
      clientProjects.forEach(p => projectMap.set(p.id, p));

      const projects = Array.from(projectMap.values()).filter(p => !p.deleted_at);
      const projectIds = projects.map(p => p.id);

      // Get all feedback for these projects, but only FROM developers (not the client's own reviews)
      const allReviews: any[] = [];

      for (const projectId of projectIds) {
        const feedbackQuery = this.db.table('project_feedback')
          .where('project_id', '=', projectId);
        const feedbackResult = await feedbackQuery.execute();
        // Filter: only include reviews NOT submitted by this client (reviews FROM developers)
        const feedbacks = (feedbackResult.data || []).filter((f: any) =>
          !f.deleted_at && f.client_id !== userId
        );

        const project = projects.find(p => p.id === projectId);

        for (const feedback of feedbacks) {
          // Get reviewer's name
          let reviewerName = 'Developer';
          try {
            const reviewerResponse = await this.db.getUserById(feedback.client_id);
            const reviewer = (reviewerResponse as any)?.user || reviewerResponse;
            reviewerName = reviewer?.fullName || reviewer?.name || 'Developer';
          } catch {
            // Fallback to 'Developer' if user not found
          }

          allReviews.push({
            id: feedback.id,
            developerName: reviewerName,
            rating: parseFloat(feedback.rating) || 0,
            comment: feedback.content || '',
            projectTitle: project?.name || 'Unknown Project',
            date: feedback.created_at,
            title: feedback.title || '',
          });
        }
      }

      // Sort by date descending and apply limit
      const sortedReviews = allReviews
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);

      return sortedReviews;
    } catch (error) {
      this.logger.error(`Failed to get client reviews: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get learning overview (for compatibility - returns empty data)
   */
  async getUserLearningOverview(userId: string) {
    return {
      totalCourses: 0,
      completedCourses: 0,
      inProgressCourses: 0,
      totalLearningTime: 0,
      currentStreak: 0,
      longestStreak: 0,
      skillsLearned: [],
      certificates: 0,
      achievements: [],
    };
  }

  /**
   * Get weekly progress (for compatibility - returns empty data)
   */
  async getWeeklyProgress(userId: string) {
    return {
      currentWeek: {
        studyTime: 0,
        lessonsCompleted: 0,
        assessmentsPassed: 0,
        xpEarned: 0,
      },
      weeklyGoal: 10,
      progressPercentage: 0,
      streakMaintained: false,
      dailyProgress: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        studyTime: 0,
        lessonsCompleted: 0,
        goalMet: false,
      })),
    };
  }

  /**
   * Get AI-powered recommendations (for compatibility - returns placeholder)
   */
  async getRecommendations(userId: string) {
    try {
      const projectsQuery = this.db.table('projects')
        .where('client_id', '=', userId);
      const projectsResult = await projectsQuery.execute();
      const projects = (projectsResult.data || []).filter((p: any) => !p.deleted_at);
      const activeProjects = projects.filter((p: any) => p.status === 'in_progress');

      const tips = [];

      if (activeProjects.length === 0) {
        tips.push('Start a new project to bring your ideas to life');
      } else {
        tips.push('Review your active project milestones regularly');
        tips.push('Communicate with your team through the project communication hub');
        tips.push('Track your project progress to stay on schedule');
      }

      return {
        nextCourses: [],
        skillsToImprove: [],
        studyTimeOptimization: 'Keep your projects on track by reviewing milestones weekly',
        personalizedTips: tips,
      };
    } catch (error) {
      this.logger.error(`Failed to get recommendations: ${error.message}`, error.stack);
      return {
        nextCourses: [],
        skillsToImprove: [],
        studyTimeOptimization: 'Review your project progress regularly',
        personalizedTips: ['Start a new project', 'Communicate with your team'],
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getActivityTitle(activityType: string): string {
    const titles: Record<string, string> = {
      project_created: 'Project Created',
      project_updated: 'Project Updated',
      milestone_completed: 'Milestone Completed',
      milestone_approved: 'Milestone Approved',
      task_completed: 'Task Completed',
      payment_processed: 'Payment Processed',
      team_assigned: 'Team Assigned',
      file_uploaded: 'File Uploaded',
      contract_signed: 'Contract Signed',
      project_started: 'Project Started',
      project_completed: 'Project Completed',
    };
    return titles[activityType] || activityType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  private getActivityDescription(activity: any): string {
    const metadata = activity.metadata || {};
    switch (activity.activity_type) {
      case 'project_created':
        return `Created project "${metadata.projectName || 'Project'}"`;
      case 'project_updated':
        return `Updated project "${metadata.projectName || 'Project'}"`;
      case 'milestone_completed':
        return `Completed milestone "${metadata.milestoneName || 'Milestone'}"`;
      case 'milestone_approved':
        return `Approved milestone "${metadata.milestoneName || 'Milestone'}"`;
      case 'task_completed':
        return `Completed task "${metadata.taskName || 'Task'}"`;
      case 'payment_processed':
        return `Processed payment of $${metadata.amount || 0}`;
      case 'team_assigned':
        return `Assigned team to project "${metadata.projectName || 'Project'}"`;
      case 'file_uploaded':
        return `Uploaded file "${metadata.fileName || 'File'}"`;
      case 'contract_signed':
        return `Signed contract for "${metadata.projectName || 'Project'}"`;
      case 'project_started':
        return `Started working on "${metadata.projectName || 'Project'}"`;
      case 'project_completed':
        return `Completed project "${metadata.projectName || 'Project'}"`;
      default:
        return activity.action || 'Activity logged';
    }
  }
}
