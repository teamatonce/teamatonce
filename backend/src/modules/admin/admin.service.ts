import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/dto';
import {
  CreateFaqDto,
  UpdateFaqDto,
  ReviewReportDto,
  BulkEmailDto,
  BulkNotificationDto,
  TargetAudience,
} from './dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // DASHBOARD
  // ==========================================

  async getDashboardStats() {
    try {
      // Get total users from auth service
      const usersResult = await this.db.listUsers({ limit: 1000 });
      const totalUsers = usersResult.users?.length || 0;
      console.log('[Dashboard] Total users:', totalUsers);

      // Get all projects (jobs)
      const allProjects = await this.db.select('projects', { where: { deleted_at: null } });
      console.log('[Dashboard] Projects fetched:', allProjects.length);
      const totalProjects = allProjects.length;
      const activeProjects = allProjects.filter((p: any) =>
        p.status === 'active' || p.status === 'in_progress' || p.status === 'planning'
      ).length;
      const pendingProjects = allProjects.filter((p: any) => p.approval_status === 'pending').length;
      const completedProjects = allProjects.filter((p: any) =>
        p.status === 'completed' || p.status === 'ended'
      ).length;

      // Get all payments
      let allPayments: any[] = [];
      try {
        allPayments = await this.db.select('payments', {});
        console.log('[Dashboard] Payments fetched:', allPayments.length);
        // Log payment statuses for debugging
        if (allPayments.length > 0) {
          const statusCounts = allPayments.reduce((acc: any, p: any) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
          }, {});
          console.log('[Dashboard] Payment status breakdown:', statusCounts);
          console.log('[Dashboard] Sample payment:', JSON.stringify(allPayments[0], null, 2));
        }
      } catch (e) {
        console.log('[Dashboard] Payments table not available, using 0');
      }

      // Calculate total revenue (completed payments only)
      const completedPayments = allPayments.filter((p: any) => p.status === 'completed');
      console.log('[Dashboard] Completed payments count:', completedPayments.length);
      const totalRevenue = completedPayments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);
      console.log('[Dashboard] Total revenue calculated:', totalRevenue);

      // Calculate monthly revenue (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      console.log('[Dashboard] Thirty days ago:', thirtyDaysAgo.toISOString());

      const monthlyPayments = allPayments.filter((p: any) => {
        if (p.status !== 'completed') return false;
        const createdAt = new Date(p.created_at);
        return createdAt >= thirtyDaysAgo;
      });
      console.log('[Dashboard] Monthly completed payments count:', monthlyPayments.length);
      const monthlyRevenue = monthlyPayments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);
      console.log('[Dashboard] Monthly revenue calculated:', monthlyRevenue);

      // Get team assignments for active users count
      let allAssignments: any[] = [];
      try {
        allAssignments = await this.db.select('project_team_assignments', { where: { is_active: true } });
        console.log('[Dashboard] Team assignments fetched:', allAssignments.length);
      } catch (e) {
        console.log('[Dashboard] Team assignments table not available');
      }

      // Count unique active team members
      const activeUsers = new Set(allAssignments.map((a: any) => a.user_id)).size;

      // Total team assignments
      const totalAssignments = allAssignments.length;

      // Count pending payouts
      const pendingPayouts = allPayments.filter(
        (p: any) => p.payment_type === 'payout' && p.status === 'pending'
      ).length;

      // Get companies count
      let totalCompanies = 0;
      try {
        const companies = await this.db.select('companies', { where: { deleted_at: null } });
        totalCompanies = companies.length;
        console.log('[Dashboard] Companies fetched:', totalCompanies);
      } catch (e) {
        console.log('[Dashboard] Companies table not available');
      }

      // Get open reports count (pending reports that need review)
      let openReports = 0;
      try {
        const reports = await this.db.select('reports', { where: { status: 'pending' } });
        openReports = reports.length;
        console.log('[Dashboard] Open reports fetched:', openReports);
      } catch (e) {
        console.log('[Dashboard] Reports table not available');
      }

      return {
        totalUsers,
        totalProjects,
        activeProjects,
        completedProjects,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        activeUsers,
        totalAssignments,
        pendingProjects,
        pendingPayouts,
        totalCompanies,
        openReports,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      // Return zeros instead of throwing to prevent dashboard from breaking
      return {
        totalUsers: 0,
        totalProjects: 0,
        activeProjects: 0,
        completedProjects: 0,
        totalRevenue: 0,
        monthlyRevenue: 0,
        activeUsers: 0,
        totalAssignments: 0,
        pendingProjects: 0,
        pendingPayouts: 0,
        totalCompanies: 0,
        openReports: 0,
      };
    }
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async getAllUsers(options: { page: number; limit: number; search?: string; role?: string }) {
    const { page = 1, limit = 20, search, role } = options;

    try {
      // Use database to list users
      const result = await this.db.listUsers({
        limit,
        offset: (page - 1) * limit,
      });

      // Filter by search if provided
      let users = result.users || [];

      // Debug: Log first user to see what fields are available
      if (users.length > 0) {
        console.log('Raw user from listUsers:', JSON.stringify(users[0], null, 2));
      }

      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(
          (user: any) =>
            user.email?.toLowerCase().includes(searchLower) ||
            user.name?.toLowerCase().includes(searchLower)
        );
      }

      // Filter by role if provided
      // ✅ FIXED: Read from direct role column, NOT from metadata
      if (role) {
        users = users.filter(
          (user: any) => user.role === role
        );
      }

      return {
        users: users.map((user: any) => ({
          id: user.id,
          email: user.email,
          name: user.name || user.fullName || user.full_name ||
                user.metadata?.name || user.metadata?.full_name || user.metadata?.fullName || null,
          role: user.role || 'client', // ✅ FIXED: Read from direct role column, NOT from metadata
          createdAt: user.created_at || user.createdAt || user.registered_at || user.registeredAt || null,
          emailVerified: user.email_verified || user.emailVerified || false,
          approvalStatus: user.metadata?.approval_status || 'approved',
          isBanned: user.metadata?.banned || false,
        })),
        total: users.length, // database doesn't return total, use filtered array length
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  async getUserById(userId: string) {
    try {
      const user = await this.db.getUserById(userId);

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'client', // ✅ FIXED: Read from direct role column, NOT from metadata
        bio: user.bio,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        emailVerified: user.email_verified,
        metadata: user.metadata,
        appMetadata: user.app_metadata,
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  async updateUser(userId: string, updateData: any) {
    try {
      await this.db.updateUser(userId, updateData);
      return { success: true, message: 'User updated successfully' };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(userId: string) {
    // TODO: Implement user deletion
    // Note: This should be a soft delete in production
    return { success: true, message: 'User deletion not yet implemented' };
  }

  async banUser(userId: string, reason: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      const newMetadata = {
        ...currentMetadata,
        banned: true,
        ban_reason: reason,
        banned_at: new Date().toISOString(),
      };

      await this.db.updateUser(userId, {
        metadata: newMetadata,
      });

      return { success: true, message: 'User banned successfully' };
    } catch (error) {
      console.error('Error banning user:', error);
      throw error;
    }
  }

  async unbanUser(userId: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      await this.db.updateUser(userId, {
        metadata: {
          ...currentMetadata,
          banned: false,
          ban_reason: null,
          unbanned_at: new Date().toISOString(),
        },
      });

      return { success: true, message: 'User unbanned successfully' };
    } catch (error) {
      console.error('Error unbanning user:', error);
      throw error;
    }
  }

  // ==========================================
  // ROLE MANAGEMENT
  // ==========================================

  async changeUserRole(userId: string, role: string) {
    const validRoles = ['client', 'seller', 'admin', 'super_admin'];

    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    try {
      await this.db.updateUser(userId, {
        metadata: {
          role: role,
        },
        app_metadata: {
          role: role,
        },
      });

      return {
        success: true,
        message: `User role changed to ${role} successfully`,
        role,
      };
    } catch (error) {
      console.error('Error changing user role:', error);
      throw error;
    }
  }

  // ==========================================
  // COURSE MANAGEMENT
  // ==========================================

  async getAllCourses(options: { page: number; limit: number; status?: string }) {
    const { page = 1, limit = 20, status } = options;

    try {
      const query: any = {};
      if (status) {
        query.status = status;
      }

      const courses = await this.db.select('courses', {
        where: query,
        limit,
        offset: (page - 1) * limit,
        orderBy: 'created_at',
        order: 'desc',
      });

      return {
        courses,
        total: courses.length,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching courses:', error);
      throw error;
    }
  }

  async approveCourse(courseId: string) {
    try {
      await this.db.update('courses', courseId, {
        status: 'published',
        approved_at: new Date().toISOString(),
      });

      return { success: true, message: 'Course approved successfully' };
    } catch (error) {
      console.error('Error approving course:', error);
      throw error;
    }
  }

  async rejectCourse(courseId: string, reason: string) {
    try {
      await this.db.update('courses', courseId, {
        status: 'rejected',
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      });

      return { success: true, message: 'Course rejected' };
    } catch (error) {
      console.error('Error rejecting course:', error);
      throw error;
    }
  }

  async deleteCourse(courseId: string) {
    try {
      await this.db.delete('courses', courseId);
      return { success: true, message: 'Course deleted successfully' };
    } catch (error) {
      console.error('Error deleting course:', error);
      throw error;
    }
  }

  // ==========================================
  // TRANSACTIONS & PAYMENTS
  // ==========================================

  async getAllTransactions(options: { page: number; limit: number }) {
    const { page = 1, limit = 20 } = options;

    try {
      const transactions = await this.db.select('transactions', {
        limit,
        offset: (page - 1) * limit,
        orderBy: 'created_at',
        order: 'desc',
      });

      return {
        transactions,
        total: transactions.length,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return { transactions: [], total: 0, page, limit };
    }
  }

  async getPayoutRequests(status?: string) {
    // TODO: Implement payout requests
    return {
      payouts: [],
      total: 0,
    };
  }

  async approvePayout(payoutId: string) {
    // TODO: Implement payout approval
    return { success: true, message: 'Payout approval not yet implemented' };
  }

  // ==========================================
  // ANALYTICS
  // ==========================================

  async getAnalyticsOverview() {
    try {
      // Get all payments
      let payments: any[] = [];
      try {
        payments = await this.db.select('payments', {});
      } catch (e) {
        console.log('[Analytics] Payments table not available');
      }

      // Calculate total revenue
      const totalRevenue = payments
        .filter((p: any) => p.status === 'completed')
        .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

      // Calculate monthly revenue (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const monthlyRevenue = payments
        .filter((p: any) => {
          if (p.status !== 'completed') return false;
          const createdAt = new Date(p.created_at);
          return createdAt >= thirtyDaysAgo;
        })
        .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

      // Get projects and calculate completion rate
      let projects: any[] = [];
      try {
        projects = await this.db.select('projects', { where: { deleted_at: null } });
      } catch (e) {
        console.log('[Analytics] Projects table not available');
      }

      const totalProjects = projects.length;
      const completedProjects = projects.filter(
        (p: any) => p.status === 'completed' || p.status === 'ended'
      ).length;
      const projectCompletionRate = totalProjects > 0
        ? Math.round((completedProjects / totalProjects) * 100)
        : 0;

      // Calculate weekly active users (last 7 days) from team assignments
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let assignments: any[] = [];
      try {
        assignments = await this.db.select('project_team_assignments', { where: { is_active: true } });
      } catch (e) {
        console.log('[Analytics] Team assignments table not available');
      }

      const recentAssignments = assignments.filter((a: any) => {
        const joinedAt = a.joined_at ? new Date(a.joined_at) : null;
        return joinedAt && joinedAt >= sevenDaysAgo;
      });
      const weeklyActiveUsers = new Set(recentAssignments.map((a: any) => a.user_id)).size;

      // Calculate average project value
      const averageProjectValue = totalProjects > 0
        ? Math.round((totalRevenue / totalProjects) * 100) / 100
        : 0;

      return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        totalProjects,
        projectCompletionRate,
        weeklyActiveUsers,
        averageProjectValue,
      };
    } catch (error) {
      console.error('Error fetching analytics overview:', error);
      return {
        totalRevenue: 0,
        monthlyRevenue: 0,
        totalProjects: 0,
        projectCompletionRate: 0,
        weeklyActiveUsers: 0,
        averageProjectValue: 0,
      };
    }
  }

  async getRevenueAnalytics(startDate?: string, endDate?: string) {
    try {
      // Parse dates or use defaults (last 90 days)
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

      let allPayments: any[] = [];
      try {
        allPayments = await this.db.select('payments', {});
      } catch (e) {
        console.log('[RevenueAnalytics] Payments table not available');
      }

      // Filter payments by date range and completed status
      const payments = allPayments.filter((p: any) => {
        const createdAt = new Date(p.created_at);
        return createdAt >= start && createdAt <= end && p.status === 'completed';
      });

      // Calculate total revenue
      const totalRevenue = payments.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.amount) || 0),
        0
      );

      // Group revenue by month
      const monthMap = new Map<string, number>();
      payments.forEach((p: any) => {
        const date = new Date(p.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = monthMap.get(monthKey) || 0;
        monthMap.set(monthKey, current + (parseFloat(p.amount) || 0));
      });

      const revenueByMonth = Array.from(monthMap.entries())
        .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Group revenue by project type
      let projects: any[] = [];
      try {
        projects = await this.db.select('projects', { where: { deleted_at: null } });
      } catch (e) {
        console.log('[RevenueAnalytics] Projects table not available');
      }
      const projectMap = new Map(projects.map((p: any) => [p.id, p]));

      const categoryMap = new Map<string, number>();
      payments.forEach((p: any) => {
        if (p.project_id) {
          const project = projectMap.get(p.project_id);
          const category = (project as any)?.project_type || 'Other';
          const current = categoryMap.get(category) || 0;
          categoryMap.set(category, current + (parseFloat(p.amount) || 0));
        }
      });

      const revenueByCategory = Array.from(categoryMap.entries())
        .map(([category, revenue]) => ({ category, revenue: Math.round(revenue * 100) / 100 }))
        .sort((a, b) => b.revenue - a.revenue);

      // Payment count and average
      const paymentCount = payments.length;
      const averagePaymentValue = paymentCount > 0
        ? Math.round((totalRevenue / paymentCount) * 100) / 100
        : 0;

      return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenueByMonth,
        revenueByCategory,
        paymentCount,
        averagePaymentValue,
      };
    } catch (error) {
      console.error('Error fetching revenue analytics:', error);
      return {
        totalRevenue: 0,
        revenueByMonth: [],
        revenueByCategory: [],
        paymentCount: 0,
        averagePaymentValue: 0,
      };
    }
  }

  // ==========================================
  // SYSTEM SETTINGS
  // ==========================================

  async getSystemSettings() {
    // TODO: Implement system settings
    return {
      siteName: 'Learning OS',
      maintenanceMode: false,
      registrationEnabled: true,
    };
  }

  async updateSystemSettings(settings: any) {
    // TODO: Implement system settings update
    return { success: true, message: 'Settings update not yet implemented' };
  }

  // ==========================================
  // ACTIVITY LOGS
  // ==========================================

  async getActivityLogs(options: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
  }) {
    // TODO: Implement activity logs
    return {
      logs: [],
      total: 0,
      page: options.page,
      limit: options.limit,
    };
  }

  // ==========================================
  // USER APPROVAL (NEW REGISTRATIONS)
  // ==========================================

  async getPendingApprovals(options: { page: number; limit: number }) {
    const { page = 1, limit = 20 } = options;

    try {
      const result = await this.db.listUsers({ limit: 1000 });
      let users = result.users || [];

      // Filter users with pending approval status
      users = users.filter(
        (user: any) =>
          user.app_metadata?.approval_status === 'pending' ||
          user.metadata?.approval_status === 'pending'
      );

      const paginatedUsers = users.slice((page - 1) * limit, page * limit);

      return {
        users: paginatedUsers.map((user: any) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || 'client', // ✅ FIXED: Read from direct role column, NOT from metadata
          createdAt: user.created_at,
          emailVerified: user.email_verified,
          approvalStatus: user.app_metadata?.approval_status || 'pending',
        })),
        total: users.length,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      throw error;
    }
  }

  async approveUser(userId: string, adminId: string, notes?: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      await this.db.updateUser(userId, {
        metadata: {
          ...currentMetadata,
          approval_status: 'approved',
          approved_by: adminId,
          approved_at: new Date().toISOString(),
          approval_notes: notes,
        },
      });

      // Notify user of approval
      try {
        await this.notificationsService.sendNotification({
          user_id: userId,
          type: NotificationType.SYSTEM,
          title: 'Account Approved',
          message: 'Your account has been approved! You can now access all features.',
          priority: NotificationPriority.HIGH,
        });
      } catch (e) {
        console.error('Failed to send approval notification:', e);
      }

      return { success: true, message: 'User approved successfully' };
    } catch (error) {
      console.error('Error approving user:', error);
      throw error;
    }
  }

  async rejectUser(userId: string, adminId: string, reason: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      await this.db.updateUser(userId, {
        metadata: {
          ...currentMetadata,
          approval_status: 'rejected',
          rejected_by: adminId,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
        },
      });

      // Notify user of rejection
      try {
        await this.notificationsService.sendNotification({
          user_id: userId,
          type: NotificationType.SYSTEM,
          title: 'Account Registration Update',
          message: `Your account registration was not approved. Reason: ${reason}`,
          priority: NotificationPriority.HIGH,
        });
      } catch (e) {
        console.error('Failed to send rejection notification:', e);
      }

      return { success: true, message: 'User rejected successfully' };
    } catch (error) {
      console.error('Error rejecting user:', error);
      throw error;
    }
  }

  async suspendUser(userId: string, reason: string, until?: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      await this.db.updateUser(userId, {
        metadata: {
          ...currentMetadata,
          suspended: true,
          suspension_reason: reason,
          suspended_at: new Date().toISOString(),
          suspended_until: until || null,
        },
      });

      return { success: true, message: 'User suspended successfully' };
    } catch (error) {
      console.error('Error suspending user:', error);
      throw error;
    }
  }

  async reactivateUser(userId: string) {
    try {
      // Get current user to preserve existing metadata
      const result = await this.db.getUserById(userId);
      const user = result?.user || result;
      const currentMetadata = user?.metadata || {};

      await this.db.updateUser(userId, {
        metadata: {
          ...currentMetadata,
          suspended: false,
          banned: false,
          suspension_reason: null,
          ban_reason: null,
          reactivated_at: new Date().toISOString(),
        },
      });

      return { success: true, message: 'User reactivated successfully' };
    } catch (error) {
      console.error('Error reactivating user:', error);
      throw error;
    }
  }

  // ==========================================
  // JOB MANAGEMENT (PROJECTS WITH PUBLIC FLAG)
  // ==========================================

  async getAllJobs(options: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    approvalStatus?: string;
  }) {
    const { page = 1, limit = 20, search, status, approvalStatus } = options;

    try {
      const query: any = {};
      if (status) query.status = status;
      if (approvalStatus) query.approval_status = approvalStatus;

      let projects = await this.db.select('projects', {
        where: query,
        orderBy: 'created_at',
        order: 'desc',
      });

      // Filter by search if provided
      if (search) {
        const searchLower = search.toLowerCase();
        projects = projects.filter(
          (p: any) =>
            p.name?.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower)
        );
      }

      const total = projects.length;
      const paginatedProjects = projects.slice((page - 1) * limit, page * limit);

      // Fetch client information for each job
      const clientIds: string[] = [...new Set(paginatedProjects.map((p: any) => p.client_id))] as string[];
      const clientMap: Record<string, any> = {};

      for (const clientId of clientIds) {
        if (clientId) {
          try {
            const result = await this.db.getUserById(clientId);
            const user = result?.user || result;
            if (user) {
              clientMap[clientId] = {
                name: user.name || (user as any).fullName || user.metadata?.name || user.email?.split('@')[0] || 'Unknown',
                email: user.email || 'N/A',
              };
            }
          } catch (e) {
            console.warn(`Could not fetch client ${clientId}:`, e);
          }
        }
      }

      // Map jobs with client information and camelCase fields
      const jobs = paginatedProjects.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        clientId: p.client_id,
        clientName: clientMap[p.client_id]?.name || 'Unknown',
        clientEmail: clientMap[p.client_id]?.email || 'N/A',
        companyId: p.company_id,
        projectType: p.project_type,
        status: p.status,
        approvalStatus: p.approval_status || 'approved',
        approvalRejectionReason: p.approval_rejection_reason,
        budgetMin: p.budget_min ? parseFloat(p.budget_min) : null,
        budgetMax: p.budget_max ? parseFloat(p.budget_max) : null,
        estimatedCost: p.estimated_cost ? parseFloat(p.estimated_cost) : null,
        currency: p.currency || 'USD',
        isPublic: p.is_public,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));

      return {
        jobs,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
  }

  async getJobById(jobId: string) {
    try {
      const jobs = await this.db.select('projects', {
        where: { id: jobId },
        limit: 1,
      });

      if (!jobs || jobs.length === 0) {
        throw new NotFoundException(`Job with ID ${jobId} not found`);
      }

      const p = jobs[0];

      // Fetch client information
      let clientName = 'Unknown';
      let clientEmail = 'N/A';
      if (p.client_id) {
        try {
          const result = await this.db.getUserById(p.client_id);
          const user = result?.user || result;
          if (user) {
            clientName = user.name || (user as any).fullName || user.metadata?.name || user.email?.split('@')[0] || 'Unknown';
            clientEmail = user.email || 'N/A';
          }
        } catch (e) {
          console.warn(`Could not fetch client ${p.client_id}:`, e);
        }
      }

      // Fetch company information if assigned
      let companyName = null;
      let assignedCompanyName = null;
      if (p.company_id) {
        try {
          const companies = await this.db.select('companies', {
            where: { id: p.company_id },
            limit: 1,
          });
          if (companies && companies.length > 0) {
            companyName = companies[0].name;
          }
        } catch (e) {
          console.warn(`Could not fetch company ${p.company_id}:`, e);
        }
      }
      if (p.assigned_company_id) {
        try {
          const companies = await this.db.select('companies', {
            where: { id: p.assigned_company_id },
            limit: 1,
          });
          if (companies && companies.length > 0) {
            assignedCompanyName = companies[0].name;
          }
        } catch (e) {
          console.warn(`Could not fetch assigned company ${p.assigned_company_id}:`, e);
        }
      }

      // Return enriched job data
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        clientId: p.client_id,
        clientName,
        clientEmail,
        companyId: p.company_id,
        companyName,
        assignedCompanyId: p.assigned_company_id,
        assignedCompanyName,
        projectType: p.project_type,
        status: p.status,
        approvalStatus: p.approval_status || 'approved',
        approvalReviewedBy: p.approval_reviewed_by,
        approvalReviewedAt: p.approval_reviewed_at,
        approvalRejectionReason: p.approval_rejection_reason,
        budgetMin: p.budget_min ? parseFloat(p.budget_min) : null,
        budgetMax: p.budget_max ? parseFloat(p.budget_max) : null,
        estimatedCost: p.estimated_cost ? parseFloat(p.estimated_cost) : null,
        actualCost: p.actual_cost ? parseFloat(p.actual_cost) : 0,
        currency: p.currency || 'USD',
        estimatedDurationDays: p.estimated_duration_days,
        startDate: p.start_date,
        expectedCompletionDate: p.expected_completion_date,
        actualCompletionDate: p.actual_completion_date,
        progressPercentage: p.progress_percentage ? parseFloat(p.progress_percentage) : 0,
        isPublic: p.is_public,
        requirements: p.requirements || {},
        techStack: p.tech_stack || [],
        frameworks: p.frameworks || [],
        features: p.features || [],
        forceClosedAt: p.force_closed_at,
        forceClosedBy: p.force_closed_by,
        forceCloseReason: p.force_close_reason,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    } catch (error) {
      console.error('Error fetching job:', error);
      throw error;
    }
  }

  async getPendingJobs(options: { page: number; limit: number }) {
    const { page = 1, limit = 20 } = options;

    try {
      const projects = await this.db.select('projects', {
        where: { approval_status: 'pending' },
        orderBy: 'created_at',
        order: 'desc',
      });

      const total = projects.length;
      const paginatedProjects = projects.slice((page - 1) * limit, page * limit);

      return {
        jobs: paginatedProjects,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching pending jobs:', error);
      throw error;
    }
  }

  async approveJob(jobId: string, adminId: string) {
    try {
      await this.db.update('projects', jobId, {
        approval_status: 'approved',
        is_public: true,
        approval_reviewed_by: adminId,
        approval_reviewed_at: new Date().toISOString(),
      });

      return { success: true, message: 'Job approved successfully' };
    } catch (error) {
      console.error('Error approving job:', error);
      throw error;
    }
  }

  async rejectJob(jobId: string, adminId: string, reason: string) {
    try {
      await this.db.update('projects', jobId, {
        approval_status: 'rejected',
        is_public: false,
        approval_reviewed_by: adminId,
        approval_reviewed_at: new Date().toISOString(),
        approval_rejection_reason: reason,
      });

      return { success: true, message: 'Job rejected successfully' };
    } catch (error) {
      console.error('Error rejecting job:', error);
      throw error;
    }
  }

  // ==========================================
  // PROJECT MANAGEMENT
  // ==========================================

  async getAllProjects(options: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }) {
    const { page = 1, limit = 20, search, status } = options;

    try {
      const query: any = {};
      if (status) query.status = status;

      let projects = await this.db.select('projects', {
        where: query,
        orderBy: 'created_at',
        order: 'desc',
      });

      if (search) {
        const searchLower = search.toLowerCase();
        projects = projects.filter(
          (p: any) =>
            p.name?.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower)
        );
      }

      const total = projects.length;
      const paginatedProjects = projects.slice((page - 1) * limit, page * limit);

      return {
        projects: paginatedProjects,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  async getProjectById(projectId: string) {
    try {
      const projects = await this.db.select('projects', {
        where: { id: projectId },
        limit: 1,
      });

      if (!projects || projects.length === 0) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      return projects[0];
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  }

  async getProjectMilestones(projectId: string) {
    try {
      const milestones = await this.db.select('milestones', {
        where: { project_id: projectId },
        orderBy: 'order_index',
        order: 'asc',
      });

      return milestones;
    } catch (error) {
      console.error('Error fetching project milestones:', error);
      return [];
    }
  }

  async forceCloseProject(projectId: string, adminId: string, reason: string) {
    try {
      await this.db.update('projects', projectId, {
        status: 'force_closed',
        force_closed_at: new Date().toISOString(),
        force_closed_by: adminId,
        force_close_reason: reason,
      });

      return { success: true, message: 'Project force-closed successfully' };
    } catch (error) {
      console.error('Error force-closing project:', error);
      throw error;
    }
  }

  // ==========================================
  // CONTENT MODERATION (REPORTS)
  // ==========================================

  async getReports(options: {
    page: number;
    limit: number;
    status?: string;
    type?: string;
    reason?: string;
  }) {
    const { page = 1, limit = 20, status, type, reason } = options;

    try {
      const query: any = {};
      if (status) query.status = status;
      if (type) query.report_type = type;
      if (reason) query.reason = reason;

      let reports = await this.db.select('reports', {
        where: query,
        orderBy: 'created_at',
        order: 'desc',
      });

      const total = reports.length;
      const paginatedReports = reports.slice((page - 1) * limit, page * limit);

      // Fetch reporter information for each report
      const transformedReports = await Promise.all(
        paginatedReports.map(async (report: any) => {
          let reporterName = null;
          let reporterEmail = null;
          let targetUserName = null;

          // Get reporter info using database.getUserById
          if (report.reporter_id) {
            try {
              const reporterResponse: any = await this.db.getUserById(report.reporter_id);
              if (reporterResponse?.success && reporterResponse.user) {
                reporterName = reporterResponse.user.fullName || reporterResponse.user.metadata?.full_name || reporterResponse.user.email;
                reporterEmail = reporterResponse.user.email;
              }
            } catch (e) {
              // Ignore errors fetching reporter info
            }
          }

          // Get target user info if it's a user report
          if (report.target_user_id) {
            try {
              const targetUserResponse: any = await this.db.getUserById(report.target_user_id);
              if (targetUserResponse?.success && targetUserResponse.user) {
                targetUserName = targetUserResponse.user.fullName || targetUserResponse.user.metadata?.full_name || targetUserResponse.user.email;
              }
            } catch (e) {
              // Ignore errors fetching target user info
            }
          }

          // Parse JSON fields
          let evidenceUrls: string[] = [];
          let metadata: Record<string, any> = {};
          try {
            evidenceUrls = report.evidence_urls ? JSON.parse(report.evidence_urls) : [];
          } catch (e) {
            evidenceUrls = [];
          }
          try {
            metadata = report.metadata ? JSON.parse(report.metadata) : {};
          } catch (e) {
            metadata = {};
          }

          // Transform to camelCase for frontend
          return {
            id: report.id,
            reporterId: report.reporter_id,
            reporterName: reporterName || metadata.reportedUserName || 'Unknown User',
            reporterEmail: reporterEmail,
            reportType: report.report_type,
            targetId: report.target_id,
            targetUserId: report.target_user_id,
            targetUserName: targetUserName || metadata.reportedUserName,
            reason: report.reason,
            description: report.description,
            evidenceUrls: evidenceUrls,
            status: report.status,
            resolution: report.resolution,
            resolutionNotes: report.resolution_notes,
            reviewedBy: report.reviewed_by,
            reviewedAt: report.reviewed_at,
            metadata: metadata,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
          };
        })
      );

      return {
        reports: transformedReports,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching reports:', error);
      return { reports: [], total: 0, page, limit };
    }
  }

  async getReportById(reportId: string) {
    try {
      const reports = await this.db.select('reports', {
        where: { id: reportId },
        limit: 1,
      });

      if (!reports || reports.length === 0) {
        throw new NotFoundException(`Report with ID ${reportId} not found`);
      }

      const report = reports[0];

      // Fetch reporter info using database.getUserById
      let reporterName = null;
      let reporterEmail = null;
      let targetUserName = null;

      if (report.reporter_id) {
        try {
          const reporterResponse: any = await this.db.getUserById(report.reporter_id);
          if (reporterResponse?.success && reporterResponse.user) {
            reporterName = reporterResponse.user.fullName || reporterResponse.user.metadata?.full_name || reporterResponse.user.email;
            reporterEmail = reporterResponse.user.email;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      if (report.target_user_id) {
        try {
          const targetUserResponse: any = await this.db.getUserById(report.target_user_id);
          if (targetUserResponse?.success && targetUserResponse.user) {
            targetUserName = targetUserResponse.user.fullName || targetUserResponse.user.metadata?.full_name || targetUserResponse.user.email;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Parse JSON fields
      let evidenceUrls: string[] = [];
      let metadata: Record<string, any> = {};
      try {
        evidenceUrls = report.evidence_urls ? JSON.parse(report.evidence_urls) : [];
      } catch (e) {
        evidenceUrls = [];
      }
      try {
        metadata = report.metadata ? JSON.parse(report.metadata) : {};
      } catch (e) {
        metadata = {};
      }

      return {
        id: report.id,
        reporterId: report.reporter_id,
        reporterName: reporterName || metadata.reportedUserName || 'Unknown User',
        reporterEmail: reporterEmail,
        reportType: report.report_type,
        targetId: report.target_id,
        targetUserId: report.target_user_id,
        targetUserName: targetUserName || metadata.reportedUserName,
        reason: report.reason,
        description: report.description,
        evidenceUrls: evidenceUrls,
        status: report.status,
        resolution: report.resolution,
        resolutionNotes: report.resolution_notes,
        reviewedBy: report.reviewed_by,
        reviewedAt: report.reviewed_at,
        metadata: metadata,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
      };
    } catch (error) {
      console.error('Error fetching report:', error);
      throw error;
    }
  }

  async reviewReport(reportId: string, adminId: string, dto: ReviewReportDto) {
    try {
      // First get the report to know the target user
      const reports = await this.db.select('reports', {
        where: { id: reportId },
        limit: 1,
      });

      if (!reports || reports.length === 0) {
        throw new NotFoundException(`Report with ID ${reportId} not found`);
      }

      const report = reports[0];

      // Update the report
      await this.db.update('reports', reportId, {
        status: 'resolved',
        resolution: dto.resolution,
        resolution_notes: dto.notes,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      });

      // If resolution is user_warned or user_banned and there's a target user, notify them
      console.log('[AdminService] Report data:', {
        target_user_id: report.target_user_id,
        resolution: dto.resolution,
        report_type: report.report_type,
      });

      if (report.target_user_id && (dto.resolution === 'user_warned' || dto.resolution === 'user_banned')) {
        try {
          // Get target user info - returns { success, user }
          const userResult: any = await this.db.getUserById(report.target_user_id);
          const targetUser = userResult?.success ? userResult.user : null;

          if (targetUser && targetUser.email) {
            console.log('[AdminService] User found with email:', targetUser.email);
            const isWarning = dto.resolution === 'user_warned';
            const reasonLabel = this.getReasonLabel(report.reason);

            // Send in-app notification
            await this.notificationsService.sendNotification({
              user_ids: [report.target_user_id],
              type: NotificationType.SECURITY,
              title: isWarning ? '⚠️ Account Warning' : '🚫 Account Suspended',
              message: isWarning
                ? `You have received a warning regarding your account activity. Reason: ${reasonLabel}. ${dto.notes || 'Please ensure you follow our community guidelines.'}`
                : `Your account has been suspended. Reason: ${reasonLabel}. ${dto.notes || 'Please contact support for more information.'}`,
              priority: NotificationPriority.HIGH,
              action_url: '/account/reports',
              data: {
                reportId,
                resolution: dto.resolution,
                reason: report.reason,
              },
              send_push: true,
            });

            // Send email notification
            const emailSubject = isWarning
              ? 'Team@Once - Account Warning Notice'
              : 'Team@Once - Account Suspension Notice';

            const emailHtml = this.buildWarningEmailHtml(
              targetUser.fullName || targetUser.email,
              isWarning,
              reasonLabel,
              dto.notes || '',
            );

            await /* TODO: use EmailService */ this.db.sendEmail(
              targetUser.email,
              emailSubject,
              emailHtml
            );

            console.log(`[AdminService] Sent ${isWarning ? 'warning' : 'ban'} notification and email to user ${targetUser.email}`);
          } else {
            console.log('[AdminService] User not found or no email. targetUser:', targetUser);
          }
        } catch (notifyError) {
          // Log but don't fail the whole operation
          console.error('[AdminService] Failed to send notification/email to reported user:', notifyError);
        }
      }

      return { success: true, message: 'Report reviewed successfully' };
    } catch (error) {
      console.error('Error reviewing report:', error);
      throw error;
    }
  }

  private getReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      spam: 'Spam',
      inappropriate: 'Inappropriate Content',
      fraud: 'Fraudulent Activity',
      harassment: 'Harassment',
      other: 'Policy Violation',
    };
    return labels[reason] || reason;
  }

  private buildWarningEmailHtml(userName: string, isWarning: boolean, reason: string, notes: string): string {
    const title = isWarning ? 'Account Warning Notice' : 'Account Suspension Notice';
    const icon = isWarning ? '⚠️' : '🚫';
    const headerColor = isWarning ? '#f59e0b' : '#dc2626';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; background-color: ${headerColor}; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${icon} ${title}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear ${userName},</p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          ${isWarning
            ? 'We are writing to inform you that your account has received a warning due to a violation of our community guidelines.'
            : 'We regret to inform you that your account has been suspended due to a serious violation of our community guidelines.'}
        </p>

        <div style="background-color: #f9fafb; border-left: 4px solid ${headerColor}; padding: 20px; margin: 20px 0;">
          <p style="font-size: 14px; color: #6b7280; margin: 0 0 10px 0;"><strong>Reason:</strong></p>
          <p style="font-size: 16px; color: #374151; margin: 0;">${reason}</p>
          ${notes ? `
          <p style="font-size: 14px; color: #6b7280; margin: 20px 0 10px 0;"><strong>Additional Notes:</strong></p>
          <p style="font-size: 16px; color: #374151; margin: 0;">${notes}</p>
          ` : ''}
        </div>

        ${isWarning ? `
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Please take this warning seriously. Continued violations may result in account suspension or termination.
        </p>
        ` : `
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          If you believe this action was taken in error, please contact our support team for assistance.
        </p>
        `}

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          You can view the details of this report in your account settings.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://teamatonce.com'}/account/reports"
             style="display: inline-block; padding: 14px 28px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            View Report Details
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          If you have any questions, please contact our support team.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f9fafb; text-align: center;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">
          © ${new Date().getFullYear()} Team@Once. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  async removeContent(contentType: string, contentId: string, reason: string) {
    try {
      // Map content types to table names
      const tableMap: Record<string, string> = {
        job: 'projects',
        project: 'projects',
        user: 'users', // Special handling needed
        gig: 'gigs',
        message: 'messages',
      };

      const tableName = tableMap[contentType];
      if (!tableName) {
        throw new BadRequestException(`Invalid content type: ${contentType}`);
      }

      if (contentType === 'user') {
        // For users, ban instead of delete
        await this.banUser(contentId, reason);
      } else {
        // Soft delete the content
        await this.db.update(tableName, contentId, {
          deleted_at: new Date().toISOString(),
          deletion_reason: reason,
        });
      }

      return { success: true, message: `${contentType} removed successfully` };
    } catch (error) {
      console.error('Error removing content:', error);
      throw error;
    }
  }

  // ==========================================
  // FAQ MANAGEMENT
  // ==========================================

  async getFaqs(options?: { category?: string; includeUnpublished?: boolean }) {
    try {
      const query: any = {};
      if (options?.category) query.category = options.category;
      if (!options?.includeUnpublished) query.is_published = true;

      // Exclude soft-deleted FAQs
      const faqs = await this.db.select('faqs', {
        where: query,
        orderBy: 'order_index',
        order: 'asc',
      });

      // Filter out soft-deleted
      return faqs.filter((faq: any) => !faq.deleted_at);
    } catch (error) {
      console.error('Error fetching FAQs:', error);
      return [];
    }
  }

  async getFaqById(faqId: string) {
    try {
      const faqs = await this.db.select('faqs', {
        where: { id: faqId },
        limit: 1,
      });

      if (!faqs || faqs.length === 0 || faqs[0].deleted_at) {
        throw new NotFoundException(`FAQ with ID ${faqId} not found`);
      }

      return faqs[0];
    } catch (error) {
      console.error('Error fetching FAQ:', error);
      throw error;
    }
  }

  async createFaq(adminId: string, dto: CreateFaqDto) {
    try {
      // Get max order index
      const existingFaqs = await this.db.select('faqs', {});
      const maxOrder = existingFaqs.reduce(
        (max: number, faq: any) => Math.max(max, faq.order_index || 0),
        0
      );

      const faq = await this.db.insert('faqs', {
        question: dto.question,
        answer: dto.answer,
        category: dto.category || 'General',
        is_published: dto.isPublished ?? false,
        order_index: maxOrder + 1,
        created_by: adminId,
      });

      return faq;
    } catch (error) {
      console.error('Error creating FAQ:', error);
      throw error;
    }
  }

  async updateFaq(faqId: string, adminId: string, dto: UpdateFaqDto) {
    try {
      const updateData: any = {
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      };

      if (dto.question !== undefined) updateData.question = dto.question;
      if (dto.answer !== undefined) updateData.answer = dto.answer;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.isPublished !== undefined) updateData.is_published = dto.isPublished;
      if (dto.orderIndex !== undefined) updateData.order_index = dto.orderIndex;

      await this.db.update('faqs', faqId, updateData);

      return await this.getFaqById(faqId);
    } catch (error) {
      console.error('Error updating FAQ:', error);
      throw error;
    }
  }

  async deleteFaq(faqId: string) {
    try {
      // Soft delete
      await this.db.update('faqs', faqId, {
        deleted_at: new Date().toISOString(),
      });

      return { success: true, message: 'FAQ deleted successfully' };
    } catch (error) {
      console.error('Error deleting FAQ:', error);
      throw error;
    }
  }

  async reorderFaqs(ids: string[]) {
    try {
      for (let i = 0; i < ids.length; i++) {
        await this.db.update('faqs', ids[i], {
          order_index: i,
        });
      }

      return { success: true, message: 'FAQs reordered successfully' };
    } catch (error) {
      console.error('Error reordering FAQs:', error);
      throw error;
    }
  }

  // ==========================================
  // BULK COMMUNICATIONS
  // ==========================================

  async sendBulkEmail(adminId: string, dto: BulkEmailDto) {
    console.log('[AdminService] sendBulkEmail called');
    console.log('[AdminService] Admin ID:', adminId);
    console.log('[AdminService] DTO:', JSON.stringify(dto, null, 2));

    try {
      // Determine target emails based on audience type
      let targetEmails: string[] = [];

      if (dto.targetAudience === 'individual' && dto.individualEmails && dto.individualEmails.length > 0) {
        // Individual mode - use the provided email addresses directly
        console.log('[AdminService] Individual mode - using provided emails');
        targetEmails = dto.individualEmails;
      } else {
        // Group mode - get users based on audience
        console.log('[AdminService] Getting target users for audience:', dto.targetAudience);
        const targetUsers = await this.getTargetUsers(dto.targetAudience, dto.targetFilters);
        targetEmails = targetUsers.map((u: any) => u.email);
      }

      console.log('[AdminService] Target emails:', targetEmails.length);
      console.log('[AdminService] Email list:', targetEmails);

      // Create email campaign record
      console.log('[AdminService] Creating email campaign record...');
      const campaign = await this.db.insert('email_campaigns', {
        name: dto.name,
        subject: dto.subject,
        content_html: dto.contentHtml,
        content_text: dto.contentText,
        target_audience: dto.targetAudience,
        target_filters: dto.targetAudience === 'individual'
          ? { individualEmails: dto.individualEmails }
          : (dto.targetFilters || {}),
        status: dto.scheduledAt ? 'scheduled' : 'sending',
        scheduled_at: dto.scheduledAt || null,
        total_recipients: targetEmails.length,
        created_by: adminId,
      });
      console.log('[AdminService] Campaign created with ID:', campaign.id);

      // Send emails to each recipient
      if (!dto.scheduledAt) {
        console.log('[AdminService] Sending emails to', targetEmails.length, 'recipients...');
        let sentCount = 0;
        let failedCount = 0;

        for (const email of targetEmails) {
          try {
            console.log('[AdminService] Sending email to:', email);
            await /* TODO: use EmailService */ this.db.sendEmail(
              email,
              dto.subject,
              dto.contentHtml,
              dto.contentText || undefined,
            );
            sentCount++;
            console.log('[AdminService] Email sent successfully to:', email);
          } catch (emailError) {
            failedCount++;
            console.error('[AdminService] Failed to send email to:', email, emailError);
          }
        }

        console.log('[AdminService] Email sending complete. Sent:', sentCount, 'Failed:', failedCount);

        await this.db.update('email_campaigns', campaign.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_count: sentCount,
          failed_count: failedCount,
        });
        console.log('[AdminService] Campaign status updated to sent');
      }

      return campaign;
    } catch (error) {
      console.error('[AdminService] Error sending bulk email:', error);
      throw error;
    }
  }

  async sendBulkNotification(adminId: string, dto: BulkNotificationDto) {
    console.log('[AdminService] sendBulkNotification called');
    console.log('[AdminService] Admin ID:', adminId);
    console.log('[AdminService] DTO:', JSON.stringify(dto, null, 2));

    try {
      let targetUserIds: string[] = [];

      if (dto.individualEmails && dto.individualEmails.length > 0) {
        console.log('[AdminService] Individual mode - looking up users by email');
        // Look up user IDs by email
        const result = await this.db.listUsers({ limit: 10000 });
        const allUsers = result.users || [];

        for (const email of dto.individualEmails) {
          const user = allUsers.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          if (user) {
            targetUserIds.push(user.id);
            console.log('[AdminService] Found user for email:', email, '-> ID:', user.id);
          } else {
            console.log('[AdminService] No user found for email:', email);
          }
        }
      } else {
        console.log('[AdminService] Getting target users for audience:', dto.targetAudience);
        const targetUsers = await this.getTargetUsers(dto.targetAudience);
        targetUserIds = targetUsers.map((u: any) => u.id);
      }

      console.log('[AdminService] Target user IDs:', targetUserIds.length);

      // Map priority from DTO to NotificationPriority enum
      const priorityMap: Record<string, NotificationPriority> = {
        low: NotificationPriority.LOW,
        normal: NotificationPriority.NORMAL,
        high: NotificationPriority.HIGH,
      };
      const priority = dto.priority ? priorityMap[dto.priority] || NotificationPriority.NORMAL : NotificationPriority.NORMAL;

      let sentCount = 0;

      for (const userId of targetUserIds) {
        try {
          console.log('[AdminService] Sending notification to user:', userId);
          await this.notificationsService.sendNotification({
            user_id: userId,
            type: (dto.type as NotificationType) || NotificationType.SYSTEM,
            title: dto.title,
            message: dto.message,
            priority,
            action_url: dto.actionUrl || undefined,
          });
          sentCount++;
          console.log('[AdminService] Notification sent successfully to:', userId);
        } catch (e) {
          console.error(`Failed to send notification to user ${userId}:`, e);
        }
      }

      console.log('[AdminService] Notification sending complete. Sent:', sentCount);

      return {
        success: true,
        message: `Notifications sent to ${sentCount} users`,
        sentCount,
      };
    } catch (error) {
      console.error('Error sending bulk notification:', error);
      throw error;
    }
  }

  async getEmailCampaigns(options?: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20, status } = options || {};

    try {
      const query: any = {};
      if (status) query.status = status;

      const campaigns = await this.db.select('email_campaigns', {
        where: query,
        orderBy: 'created_at',
        order: 'desc',
      });

      const total = campaigns.length;
      const paginatedCampaigns = campaigns.slice((page - 1) * limit, page * limit);

      return {
        campaigns: paginatedCampaigns,
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error fetching email campaigns:', error);
      return { campaigns: [], total: 0, page, limit };
    }
  }

  async getEmailCampaignById(campaignId: string) {
    try {
      const campaigns = await this.db.select('email_campaigns', {
        where: { id: campaignId },
        limit: 1,
      });

      if (!campaigns || campaigns.length === 0) {
        throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
      }

      return campaigns[0];
    } catch (error) {
      console.error('Error fetching email campaign:', error);
      throw error;
    }
  }

  // Helper method to get users based on target audience
  private async getTargetUsers(
    audience: TargetAudience,
    filters?: Record<string, any>
  ): Promise<any[]> {
    const result = await this.db.listUsers({ limit: 10000 });
    let users = result.users || [];

    // ✅ FIXED: Filter by direct role column, NOT from metadata
    switch (audience) {
      case TargetAudience.CLIENTS:
        users = users.filter(
          (u: any) => u.role === 'client'
        );
        break;
      case TargetAudience.SELLERS:
        users = users.filter(
          (u: any) => u.role === 'seller'
        );
        break;
      case TargetAudience.PENDING_APPROVAL:
        users = users.filter(
          (u: any) => u.app_metadata?.approval_status === 'pending'
        );
        break;
      case TargetAudience.ALL:
      default:
        // Keep all users
        break;
    }

    return users;
  }
}
