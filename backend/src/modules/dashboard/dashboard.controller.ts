import { Controller, Get, UseGuards, Request, Query, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { ProjectService } from '../teamatonce/project/project.service';
import { AnalyticsService } from '../teamatonce/analytics/analytics.service';
import { ActivityLoggerService } from '../activity-logger/activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('Dashboard')
@Controller('company/:companyId/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly projectService: ProjectService,
    private readonly analyticsService: AnalyticsService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('data')
  @ApiOperation({ summary: 'Get all dashboard data in a single call' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboardData(@Request() req, @Param('companyId') companyId: string) {
    const userId = req.user.sub || req.user.userId;
    return this.dashboardService.getDashboardData(userId, companyId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  async getDashboardStats(@Request() req, @Param('companyId') companyId: string) {
    const userId = req.user.sub || req.user.userId;

    try {
      // Get dashboard data from service which calculates real stats
      // Pass both userId and companyId to get comprehensive stats
      const dashboardData = await this.dashboardService.getDashboardData(userId, companyId);

      // Return Team@Once client stats
      return {
        activeProjects: dashboardData.stats.activeProjects || 0,
        totalProjects: dashboardData.stats.totalProjects || 0,
        totalSpent: dashboardData.stats.totalSpent || 0,
        developersHired: dashboardData.stats.developersHired || 0,
        completedProjects: dashboardData.stats.completedProjects || 0,
        averageRating: dashboardData.stats.averageRating || 0,
        totalReviews: dashboardData.stats.totalReviews || 0,
        totalHoursTracked: dashboardData.stats.totalHoursTracked || 0
      };
    } catch (error) {
      // Fallback to zero stats if analytics fails
      return {
        activeProjects: 0,
        totalProjects: 0,
        totalSpent: 0,
        developersHired: 0,
        completedProjects: 0,
        averageRating: 0,
        totalReviews: 0,
        totalHoursTracked: 0
      };
    }
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get dashboard notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getDashboardNotifications(@Request() req) {
    const userId = req.user.sub || req.user.userId;

    try {
      // Get real notifications from NotificationsService
      const result = await this.notificationsService.getNotifications(userId, { limit: 10 });

      return {
        notifications: result.data || [],
        unreadCount: result.unread_count || 0,
      };
    } catch (error) {
      return {
        notifications: [],
        unreadCount: 0,
      };
    }
  }

  @Get('projects/recent')
  @ApiOperation({ summary: 'Get recent projects' })
  @ApiResponse({ status: 200, description: 'Recent projects retrieved successfully' })
  async getRecentProjects(
    @Request() req,
    @Param('companyId') companyId: string,
    @Query('limit') limit?: number
  ) {
    const userId = req.user.sub || req.user.userId;

    try {
      // Get projects for this company (where user is client or member)
      const projects = await this.projectService.getCompanyProjects(companyId);

      // Sort by updatedAt and limit
      const recentProjects = projects
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit || 5);

      // Fetch milestones for each project in parallel
      const projectsWithMilestones = await Promise.all(
        recentProjects.map(async (project) => {
          try {
            const milestonesResponse = await this.projectService.getProjectMilestones(project.id);
            return {
              ...project,
              milestones: milestonesResponse.milestones || [],
            };
          } catch {
            return { ...project, milestones: [] };
          }
        })
      );

      // Transform to match frontend expected format
      const formattedProjects = projectsWithMilestones.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        progress: project.progressPercentage || project.progress_percentage || 0,
        budget: project.estimatedCost || project.estimated_cost || 0,
        spentAmount: project.actualCost || project.actual_cost || 0,
        startDate: project.startDate || project.start_date,
        endDate: project.expectedCompletionDate || project.expected_completion_date || project.deadline,
        createdAt: project.createdAt || project.created_at,
        updatedAt: project.updatedAt || project.updated_at,
        team: project.assignedTeam || project.assigned_team || [],
        milestones: (project.milestones || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          status: m.status,
          amount: m.amount || m.milestoneAmount || 0,
          startDate: m.startDate || m.start_date,
          dueDate: m.dueDate || m.due_date,
          completedDate: m.completedDate || m.completed_date,
          progress: m.progress || 0,
          deliverables: m.deliverables || [],
        })),
        technologies: project.technologies || project.tech_stack || [],
      }));

      return {
        projects: formattedProjects,
        total: projects.length,
      };
    } catch (error) {
      return {
        projects: [],
        total: 0,
      };
    }
  }

  @Get('activities/recent')
  @ApiOperation({ summary: 'Get recent activities' })
  @ApiResponse({ status: 200, description: 'Recent activities retrieved successfully' })
  async getRecentActivities(
    @Request() req,
    @Param('companyId') companyId: string,
    @Query('limit') limit?: number
  ) {
    const userId = req.user.sub || req.user.userId;

    try {
      // Get company projects first
      const projects = await this.projectService.getCompanyProjects(companyId);
      const projectIds = projects.map(p => p.id);

      // Get activities for these projects
      let activities = [];
      if (projectIds.length > 0) {
        activities = await this.activityLogger.getProjectsActivities(projectIds, limit || 10);
      }

      // If no project activities, fallback to user activities
      if (activities.length === 0) {
        activities = await this.activityLogger.getUserActivities(userId, limit || 10);
      }

      // Transform to frontend format
      const formattedActivities = activities.map(activity => ({
        id: activity.id,
        type: activity.activity_type,
        title: this.getActivityTitle(activity.activity_type),
        description: this.getActivityDescription(activity),
        timestamp: new Date(activity.created_at),
        user: { id: activity.user_id, name: 'User', avatar: null },
        projectId: activity.project_id,
        projectName: activity.metadata?.projectName || 'Project'
      }));

      return {
        activities: formattedActivities,
      };
    } catch (error) {
      return {
        activities: [],
      };
    }
  }

  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markNotificationAsRead(@Request() req, @Param('notificationId') notificationId: string) {
    const userId = req.user.sub || req.user.userId;

    try {
      await this.notificationsService.markAsRead(userId, notificationId);
      return {
        success: true,
        message: 'Notification marked as read'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllNotificationsAsRead(@Request() req) {
    const userId = req.user.sub || req.user.userId;

    try {
      // Get all unread notifications
      const notifications = await this.notificationsService.getNotifications(userId, { is_read: false });
      const notificationIds = notifications.data.map(n => n.id);

      // Mark all as read
      await this.notificationsService.bulkMarkAsRead(userId, { notification_ids: notificationIds });

      return {
        success: true,
        message: 'All notifications marked as read'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get complete dashboard data' })
  @ApiResponse({ status: 200, description: 'Complete dashboard data retrieved successfully' })
  async getCompleteDashboard(@Request() req, @Param('companyId') companyId: string) {
    const userId = req.user.sub || req.user.userId;

    // Get all dashboard data in parallel
    const [stats, projects, activities, notifications] = await Promise.allSettled([
      this.getDashboardStats(req, companyId),
      this.getRecentProjects(req, companyId, 5),
      this.getRecentActivities(req, companyId, 10),
      this.getDashboardNotifications(req),
    ]);

    return {
      stats: stats.status === 'fulfilled' ? stats.value : this.getDefaultStats(),
      recentProjects: projects.status === 'fulfilled' ? projects.value.projects : [],
      recentActivities: activities.status === 'fulfilled' ? activities.value.activities : [],
      notifications: notifications.status === 'fulfilled' ? notifications.value.notifications : []
    };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get learning overview' })
  @ApiResponse({ status: 200, description: 'Learning overview retrieved successfully' })
  async getLearningOverview(@Request() req) {
    const userId = req.user.sub || req.user.userId;
    return this.dashboardService.getUserLearningOverview(userId);
  }

  @Get('weekly-progress')
  @ApiOperation({ summary: 'Get weekly progress' })
  @ApiResponse({ status: 200, description: 'Weekly progress retrieved successfully' })
  async getWeeklyProgress(@Request() req) {
    const userId = req.user.sub || req.user.userId;
    return this.dashboardService.getWeeklyProgress(userId);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Get AI-powered recommendations' })
  @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
  async getRecommendations(@Request() req) {
    const userId = req.user.sub || req.user.userId;
    return this.dashboardService.getRecommendations(userId);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Get client reviews from developers' })
  @ApiResponse({ status: 200, description: 'Client reviews retrieved successfully' })
  async getClientReviews(
    @Request() req,
    @Param('companyId') companyId: string,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.dashboardService.getClientReviews(userId, companyId, limit || 10);
  }

  // Helper methods
  private getActivityTitle(activityType: string): string {
    const titles = {
      'project_created': 'Project Created',
      'project_updated': 'Project Updated',
      'milestone_completed': 'Milestone Completed',
      'milestone_approved': 'Milestone Approved',
      'task_completed': 'Task Completed',
      'payment_processed': 'Payment Processed',
      'team_assigned': 'Team Assigned',
      'file_uploaded': 'File Uploaded',
    };
    return titles[activityType] || activityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private getActivityDescription(activity: any): string {
    const metadata = activity.metadata || {};
    switch (activity.activity_type) {
      case 'project_created':
        return `Created project "${metadata.projectName || 'Project'}"`;
      case 'milestone_completed':
        return `Completed milestone "${metadata.milestoneName || 'Milestone'}"`;
      case 'task_completed':
        return `Completed task "${metadata.taskName || 'Task'}"`;
      case 'payment_processed':
        return `Processed payment of $${metadata.amount || 0}`;
      default:
        return activity.action || 'Activity logged';
    }
  }

  private getDefaultStats() {
    return {
      activeProjects: 0,
      totalProjects: 0,
      totalSpent: 0,
      developersHired: 0,
      completedProjects: 0,
      averageRating: 0,
      totalReviews: 0,
      totalHoursTracked: 0
    };
  }
}
