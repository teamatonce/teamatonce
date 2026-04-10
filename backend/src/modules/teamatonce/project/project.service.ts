import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../../notifications/dto';
import { TeamAtOnceGateway } from '../../../websocket/teamatonce.gateway';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateMilestoneDto,
  ApproveMilestoneDto,
  SubmitMilestoneDto,
  RequestMilestoneFeedbackDto,
  CreateTaskDto,
  UpdateTaskDto,
  ProjectStatus,
  MilestoneStatus,
  TaskStatus,
} from './dto/project.dto';
import { ProjectMemberService } from './project-member.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => ProjectMemberService))
    private readonly projectMemberService: ProjectMemberService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => TeamAtOnceGateway))
    private readonly gateway: TeamAtOnceGateway,
  ) {}

  /**
   * Transform milestone to frontend format and emit via WebSocket
   */
  private emitMilestoneEvent(projectId: string, eventType: string, milestoneData: any, userId?: string): void {
    this.gateway.sendToProject(projectId, eventType, {
      milestone: milestoneData,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit task events via WebSocket for real-time updates
   */
  private emitTaskEvent(projectId: string, eventType: string, taskData: any, userId?: string): void {
    this.gateway.sendToProject(projectId, eventType, {
      task: taskData,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the correct company ID for a user based on their role in the project
   * - Client team members → use project.company_id (client's company)
   * - Developer team members → use project.assigned_company_id (developer's company)
   */
  private async getCompanyIdForUser(
    userId: string,
    projectId: string,
    project: any,
    projectMembers: any[],
  ): Promise<string | null> {
    // Check if user is the project client (owner)
    if (userId === project.client_id) {
      return project.company_id;
    }

    // Find user in project_members to determine their member_type
    const member = projectMembers.find((m: any) => m.user_id === userId);

    if (member) {
      if (member.member_type === 'client') {
        // Client team member → use client's company ID
        return project.company_id;
      } else if (member.member_type === 'developer') {
        // Developer team member → use assigned developer company ID
        return project.assigned_company_id || member.company_id;
      }
    }

    // Fallback: check if user belongs to the assigned developer company
    if (project.assigned_company_id) {
      const companyMember = await this.db.findOne('company_team_members', {
        company_id: project.assigned_company_id,
        user_id: userId,
        status: 'active',
      });
      if (companyMember) {
        return project.assigned_company_id;
      }
    }

    // Fallback: check if user belongs to the client's company
    if (project.company_id) {
      const clientCompanyMember = await this.db.findOne('company_team_members', {
        company_id: project.company_id,
        user_id: userId,
        status: 'active',
      });
      if (clientCompanyMember) {
        return project.company_id;
      }
    }

    // Default to client's company if we can't determine
    return project.company_id;
  }

  // ============================================
  // PROJECT APPROVAL STATUS VALIDATION
  // ============================================

  /**
   * Check if a project is rejected and throw an error if so
   * This should be called before any action that modifies project data
   */
  async validateProjectNotRejected(projectId: string): Promise<void> {
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    if (project.approval_status === 'rejected') {
      throw new BadRequestException(
        'This action cannot be performed on a rejected project. The project has been rejected by admin and is no longer available for modifications.'
      );
    }
  }

  /**
   * Get project and validate it's not rejected in one call
   * Returns the project if valid, throws if rejected or not found
   */
  async getProjectAndValidateNotRejected(projectId: string): Promise<any> {
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    if (project.approval_status === 'rejected') {
      throw new BadRequestException(
        'This action cannot be performed on a rejected project. The project has been rejected by admin and is no longer available for modifications.'
      );
    }

    return project;
  }

  // ============================================
  // PROJECT MANAGEMENT
  // ============================================

  async createProject(clientId: string, dto: CreateProjectDto & { companyId?: string }) {
    const projectData = {
      client_id: clientId,
      company_id: dto.companyId || null, // Add company_id from DTO
      name: dto.name,
      description: dto.description || null,
      project_type: dto.projectType,
      template_id: dto.templateId || null,
      status: ProjectStatus.PLANNING,
      requirements: JSON.stringify(dto.requirements || {}),
      tech_stack: JSON.stringify(dto.techStack || []),
      frameworks: JSON.stringify(dto.frameworks || []),
      features: JSON.stringify(dto.features || []),
      estimated_cost: dto.estimatedCost || null,
      budget_min: dto.budgetMin || null,
      budget_max: dto.budgetMax || null,
      currency: dto.currency || 'USD',
      estimated_duration_days: dto.estimatedDurationDays || null,
      start_date: dto.startDate || null,
      expected_completion_date: dto.expectedCompletionDate || null,
      preferred_end_date: dto.preferredEndDate || null,
      progress_percentage: 0,
      actual_cost: 0,
      assigned_team: JSON.stringify([]),
      settings: JSON.stringify({}),
      metadata: JSON.stringify({}),
    };

    const project = await this.db.insert('projects', projectData);

    console.log(`[ProjectService] Project created with company_id: ${dto.companyId || 'null'}`);

    // Automatically add the client as a project member with their company_id
    try {
      await this.projectMemberService.addClientToProject(project.id, clientId, dto.companyId);
      console.log(`[ProjectService] Client ${clientId} added as member to project ${project.id} with company_id ${dto.companyId || 'null'}`);
    } catch (error) {
      console.error('[ProjectService] Failed to add client as project member:', error);
      // Don't fail project creation if member addition fails
    }

    return project;
  }

  async getProject(projectId: string) {
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // Parse JSON fields
    return this.parseProjectJson(project);
  }

  async getClientProjects(clientId: string) {
    const projects = await this.db.findMany(
      'projects',
      { client_id: clientId, deleted_at: null },
      { orderBy: 'created_at', order: 'desc' }
    );

    return projects.map(p => this.parseProjectJson(p));
  }

  /**
   * Get all projects for a user - both as client (owner) AND as a member
   * This is used for the SimpleMegaMenu to show all projects user has access to
   */
  async getUserProjects(userId: string) {
    // 1. Get projects where user is the client/owner
    const ownedProjects = await this.db.findMany(
      'projects',
      { client_id: userId, deleted_at: null },
      { orderBy: 'created_at', order: 'desc' }
    );

    // 2. Get project IDs where user is a member from project_members table
    const membershipQuery = this.db.table('project_members')
      .where('user_id', '=', userId)
      .where('is_active', '=', true);

    const membershipResult = await membershipQuery.execute();
    const memberships = membershipResult.data || [];

    // Get project IDs from memberships (excluding already owned projects)
    const ownedProjectIds = new Set(ownedProjects.map(p => p.id));
    const memberProjectIds = memberships
      .map(m => m.project_id)
      .filter(id => !ownedProjectIds.has(id));

    // 3. Fetch member projects if any
    let memberProjects = [];
    if (memberProjectIds.length > 0) {
      const memberProjectsQuery = this.db.table('projects')
        .whereIn('id', memberProjectIds)
        .where('deleted_at', '=', null)
        .orderBy('created_at', 'desc');

      const memberProjectsResult = await memberProjectsQuery.execute();
      memberProjects = memberProjectsResult.data || [];
    }

    // 4. Combine and parse all projects
    const allProjects = [...ownedProjects, ...memberProjects];
    return allProjects.map(p => this.parseProjectJson(p));
  }

  async getCompanyProjects(companyId: string, userId?: string) {
    // If userId is provided, filter by projects where user is a member
    if (userId) {
      // First, get all project IDs where user is a member from project_members table
      // Don't filter by company_id here - we'll filter by the project's company_id instead
      const membershipQuery = this.db.table('project_members')
        .where('user_id', '=', userId)
        .where('is_active', '=', true);

      const membershipResult = await membershipQuery.execute();
      const memberships = membershipResult.data || [];

      if (memberships.length === 0) {
        return []; // User has no project memberships
      }

      // Get project IDs from memberships
      const projectIds = memberships.map(m => m.project_id);

      // Fetch projects that user is a member of
      const projectsQuery = this.db.table('projects')
        .whereIn('id', projectIds)
        .where('deleted_at', '=', null)
        .orderBy('created_at', 'desc');

      const projectsResult = await projectsQuery.execute();
      const allProjects = projectsResult.data || [];

      // Filter by project's company_id OR assigned_company_id (not project_members.company_id)
      const projects = allProjects.filter(p =>
        p.company_id === companyId || p.assigned_company_id === companyId
      );

      return projects.map(p => this.parseProjectJson(p));
    }

    // If no userId provided, return all projects where company_id OR assigned_company_id matches
    const allProjectsQuery = this.db.table('projects')
      .where('deleted_at', '=', null)
      .orderBy('created_at', 'desc');

    const allProjectsResult = await allProjectsQuery.execute();
    const allProjects = allProjectsResult.data || [];

    // Filter: company_id OR assigned_company_id matches
    const projects = allProjects.filter(p =>
      p.company_id === companyId || p.assigned_company_id === companyId
    );

    return projects.map(p => this.parseProjectJson(p));
  }

  /**
   * Get all members of a project with their details (name, email, etc.)
   * @param projectId Project ID
   * @returns List of project members with user details
   */
  async getProjectMembers(projectId: string) {
    // Verify project exists
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // Get all active project members with user details
    const members = await this.projectMemberService.getProjectMembers(projectId, true);

    return {
      projectId,
      members: members.map((member: any) => ({
        id: member.id,
        userId: member.user_id,
        memberType: member.member_type,
        companyId: member.company_id,
        role: member.role,
        permissions: member.permissions,
        joinedAt: member.joined_at,
        isActive: member.is_active,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              avatar: member.user.avatar,
            }
          : null,
      })),
      total: members.length,
    };
  }

  /**
   * Remove a member from a project
   * @param projectId Project ID
   * @param userId User ID of the member to remove
   * @returns Result of the removal operation
   */
  async removeProjectMember(projectId: string, userId: string) {
    // Verify project exists
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // Remove the member
    return this.projectMemberService.removeProjectMember(projectId, userId);
  }

  async updateProject(projectId: string, dto: UpdateProjectDto, enforceplanningOnly: boolean = false) {
    // Get the project to check its status
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // If enforceplanningOnly is true, only allow updates for planning stage projects
    if (enforceplanningOnly && project.status !== ProjectStatus.PLANNING) {
      throw new BadRequestException('Only projects in planning stage can be edited');
    }

    const updateData: any = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status) updateData.status = dto.status;
    if (dto.techStack) updateData.tech_stack = JSON.stringify(dto.techStack);
    if (dto.frameworks) updateData.frameworks = JSON.stringify(dto.frameworks);
    if (dto.progressPercentage !== undefined) {
      updateData.progress_percentage = dto.progressPercentage;
    }
    if (dto.settings) updateData.settings = JSON.stringify(dto.settings);
    if (dto.estimatedCost !== undefined) updateData.estimated_cost = dto.estimatedCost;
    if (dto.budgetMin !== undefined) updateData.budget_min = dto.budgetMin;
    if (dto.budgetMax !== undefined) updateData.budget_max = dto.budgetMax;
    if (dto.startDate !== undefined) updateData.start_date = dto.startDate || null;
    if (dto.expectedCompletionDate !== undefined) updateData.expected_completion_date = dto.expectedCompletionDate || null;
    if (dto.preferredEndDate !== undefined) updateData.preferred_end_date = dto.preferredEndDate || null;

    updateData.updated_at = new Date().toISOString();

    await this.db.update('projects', projectId, updateData);
    return this.getProject(projectId);
  }

  async deleteProject(projectId: string, enforceplanningOnly: boolean = false) {
    // Get the project to check its status
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // If enforceplanningOnly is true, only allow deletion for planning stage projects
    if (enforceplanningOnly && project.status !== ProjectStatus.PLANNING) {
      throw new BadRequestException('Only projects in planning stage can be deleted');
    }

    // Soft delete
    await this.db.update('projects', projectId, {
      deleted_at: new Date().toISOString(),
    });

    return { success: true, message: 'Project deleted successfully' };
  }

  async assignTeam(projectId: string, teamMemberIds: string[], teamLeadId?: string, projectRole?: string) {
    // First, update the projects table with assigned team
    const updateData: any = {
      assigned_team: JSON.stringify(teamMemberIds),
      updated_at: new Date().toISOString(),
    };

    if (teamLeadId) {
      updateData.team_lead_id = teamLeadId;
    }

    await this.db.update('projects', projectId, updateData);

    // Get the project to access company_id and client_id
    const project = await this.getProject(projectId);

    // For each team member ID, add them to project_members table
    for (const memberId of teamMemberIds) {
      try {
        // Get the company team member to access user_id
        const companyMember = await this.db.findOne('company_team_members', {
          id: memberId,
        });

        if (!companyMember) {
          console.warn(`[assignTeam] Company team member ${memberId} not found, skipping`);
          continue;
        }

        // Check if this member is already in project_members
        const existingMember = await this.db.findOne('project_members', {
          project_id: projectId,
          user_id: companyMember.user_id,
        });

        if (existingMember) {
          console.log(`[assignTeam] Member ${companyMember.user_id} already in project_members`);
          continue;
        }

        // Determine the role - use projectRole from frontend if provided, otherwise default to member/lead
        let memberRole = 'member';
        if (projectRole) {
          // Use the role selected in the frontend (admin, developer, designer, qa)
          memberRole = projectRole;
        } else if (memberId === teamLeadId) {
          // Fallback to lead if marked as team lead
          memberRole = 'lead';
        }

        // Add to project_members table
        const memberData = {
          project_id: projectId,
          user_id: companyMember.user_id,
          company_id: project.company_id || companyMember.company_id,
          member_type: 'developer', // Team members are developers
          role: memberRole,
          permissions: JSON.stringify(['read', 'write', 'comment']),
          joined_at: new Date().toISOString(),
          is_active: true,
        };

        await this.db.insert('project_members', memberData);
        console.log(`[assignTeam] Added member ${companyMember.user_id} to project_members with role ${memberRole}`);
      } catch (error) {
        console.error(`[assignTeam] Error adding member ${memberId} to project_members:`, error);
        // Continue with other members even if one fails
      }
    }

    return this.getProject(projectId);
  }

  /**
   * Get real team members assigned to a project from the database
   * Fetches from project_team_assignments and joins with team_members table
   */
  async getProjectTeamMembers(projectId: string) {
    try {
      // Verify project exists
      await this.getProject(projectId);

      // Get active team assignments for this project
      const assignmentsQuery = this.db.table('project_team_assignments')
        .where('project_id', '=', projectId)
        .where('is_active', '=', true);

      const assignmentsResult = await assignmentsQuery.execute();
      const assignments = assignmentsResult.data || [];

      if (assignments.length === 0) {
        return { members: [] };
      }

      // Get team member IDs from assignments
      const teamMemberIds = assignments.map(a => a.team_member_id);

      // Fetch team member details
      const teamMembersQuery = this.db.table('team_members')
        .whereIn('id', teamMemberIds)
        .where('is_active', '=', true);

      const teamMembersResult = await teamMembersQuery.execute();
      const teamMembers = teamMembersResult.data || [];

      // Enrich team members with assignment data
      const enrichedMembers = teamMembers.map(member => {
        const assignment = assignments.find(a => a.team_member_id === member.id);

        // Parse JSON fields
        const skills = this.safeJsonParse(member.skills) || [];
        const technologies = this.safeJsonParse(member.technologies) || [];

        return {
          id: member.id,
          userId: member.user_id,
          name: member.display_name,
          email: member.user_id, // In database, user_id can be used as email reference
          role: this.mapTeamRoleToProjectRole(assignment?.project_role || member.role),
          avatar: member.profile_image || '/default-avatar.png',
          skills: [...skills, ...technologies], // Combine skills and technologies
          joinedAt: assignment?.assigned_at || member.created_at,
          status: assignment?.is_active ? 'active' : 'inactive',
          availability: member.availability_status || 'available',
          // Additional useful fields
          projectRole: assignment?.project_role,
          allocationPercentage: assignment?.allocation_percentage,
          hourlyRate: member.hourly_rate,
          experienceYears: member.experience_years,
          bio: member.bio,
        };
      });

      return {
        members: enrichedMembers,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('[ProjectService] Error fetching project team members:', error);
      throw new BadRequestException('Failed to fetch project team members');
    }
  }

  /**
   * Map team member role to project role format
   */
  private mapTeamRoleToProjectRole(role: string): string {
    const roleMap: { [key: string]: string } = {
      'lead': 'project_manager',
      'pm': 'project_manager',
      'developer': 'developer',
      'dev': 'developer',
      'designer': 'designer',
      'qa': 'qa',
      'tester': 'qa',
      'client': 'client',
    };

    return roleMap[role?.toLowerCase()] || role || 'developer';
  }

  // ============================================
  // MILESTONE MANAGEMENT
  // ============================================

  async createMilestone(projectId: string, dto: CreateMilestoneDto, createdBy?: string) {
    // Verify project exists and check status
    const project = await this.getProject(projectId);

    // Block creation on completed or ended projects
    if (project.status === 'completed' || project.status === 'ended') {
      throw new BadRequestException('Cannot create milestones on completed or ended projects');
    }

    const milestoneData = {
      project_id: projectId,
      name: dto.name,
      description: dto.description || null,
      milestone_type: dto.milestoneType,
      order_index: dto.orderIndex,
      status: MilestoneStatus.PENDING,
      deliverables: JSON.stringify(dto.deliverables || []),
      acceptance_criteria: JSON.stringify(dto.acceptanceCriteria || []),
      estimated_hours: dto.estimatedHours || null,
      actual_hours: 0,
      due_date: dto.dueDate || null,
      milestone_amount: dto.milestoneAmount || null,
      payment_status: 'pending',
      requires_approval: true,
    };

    const milestone = await this.db.insert('project_milestones', milestoneData);
    const enrichedMilestone = await this.getMilestone(milestone.id);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(projectId, 'milestone-created', enrichedMilestone, createdBy);

    // Send push notification to project members
    try {
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Collect all user IDs to notify (excluding creator)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== createdBy);

      // Add client to notifications if not already included and not the creator
      if (project.client_id && project.client_id !== createdBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      if (notifyUserIds.length > 0 && createdBy) {
        const creator = await this.db.getUserById(createdBy);
        const notificationTitle = `📋 New Milestone: ${dto.name}`;
        const notificationMessage = `${creator?.name || 'A team member'} created a new milestone "${dto.name}" in project "${project.name}".`;

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/milestone-approval`,
            data: {
              projectId,
              companyId: userCompanyId,
              milestoneId: milestone.id,
              milestoneTitle: dto.name,
            },
            send_push: true,
          });
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone creation notification:', error);
    }

    return enrichedMilestone;
  }

  async getProjectMilestones(projectId: string) {
    const milestones = await this.db.findMany(
      'project_milestones',
      { project_id: projectId },
      { orderBy: 'order_index', order: 'asc' }
    );

    // Enrich milestones with progress calculation
    const enrichedMilestones = await Promise.all(
      milestones.map(async (m) => {
        const parsed = this.parseMilestoneJson(m);

        // Calculate progress based on tasks
        const progress = await this.calculateMilestoneProgress(m.id);

        return {
          id: parsed.id,
          projectId: parsed.project_id, // Include projectId for WebSocket event filtering
          title: parsed.name,
          description: parsed.description || '',
          status: parsed.status,
          dueDate: parsed.due_date,
          progress,
          amount: parsed.milestone_amount ? parseFloat(parsed.milestone_amount) : null,
          deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : [],
          acceptanceCriteria: Array.isArray(parsed.acceptance_criteria) ? parsed.acceptance_criteria : [],
          estimatedHours: parsed.estimated_hours ? parseFloat(parsed.estimated_hours) : null,
          createdAt: parsed.created_at,
          updatedAt: parsed.updated_at,
          milestoneType: parsed.milestone_type,
          orderIndex: parsed.order_index,
          paymentStatus: parsed.payment_status,
          feedback: parsed.feedback || null,
          submissionCount: parsed.submission_count || 0,
          submittedBy: parsed.submitted_by || null,
          submittedAt: parsed.submitted_at || null,
          reviewedBy: parsed.reviewed_by || null,
          reviewedAt: parsed.reviewed_at || null,
        };
      })
    );

    return { milestones: enrichedMilestones };
  }

  /**
   * Calculate milestone progress based on tasks
   */
  private async calculateMilestoneProgress(milestoneId: string): Promise<number> {
    try {
      // Get all tasks for this milestone
      const tasks = await this.db.findMany('project_tasks', {
        milestone_id: milestoneId,
      });

      if (!tasks || tasks.length === 0) {
        return 0;
      }

      // Count completed tasks
      const completedTasks = tasks.filter(
        (t) => t.status === TaskStatus.DONE
      ).length;

      // Calculate percentage
      const progress = Math.round((completedTasks / tasks.length) * 100);
      return progress;
    } catch (error) {
      console.error('Error calculating milestone progress:', error);
      return 0;
    }
  }

  /**
   * Get raw milestone data (for internal use)
   */
  private async getMilestoneRaw(milestoneId: string) {
    const milestone = await this.db.findOne('project_milestones', {
      id: milestoneId,
    });

    if (!milestone) {
      throw new NotFoundException(`Milestone with ID ${milestoneId} not found`);
    }

    return this.parseMilestoneJson(milestone);
  }

  /**
   * Get milestone with enriched data (for API responses)
   */
  async getMilestone(milestoneId: string) {
    const milestone = await this.db.findOne('project_milestones', {
      id: milestoneId,
    });

    if (!milestone) {
      throw new NotFoundException(`Milestone with ID ${milestoneId} not found`);
    }

    const parsed = this.parseMilestoneJson(milestone);

    // Calculate progress based on tasks
    const progress = await this.calculateMilestoneProgress(milestone.id);

    // Return enriched format matching the DTO
    return {
      id: parsed.id,
      projectId: parsed.project_id, // Include projectId for WebSocket event filtering
      title: parsed.name,
      description: parsed.description || '',
      status: parsed.status,
      dueDate: parsed.due_date,
      progress,
      amount: parsed.milestone_amount ? parseFloat(parsed.milestone_amount) : null,
      deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : [],
      acceptanceCriteria: Array.isArray(parsed.acceptance_criteria) ? parsed.acceptance_criteria : [],
      estimatedHours: parsed.estimated_hours ? parseFloat(parsed.estimated_hours) : null,
      createdAt: parsed.created_at,
      updatedAt: parsed.updated_at,
      milestoneType: parsed.milestone_type,
      orderIndex: parsed.order_index,
      paymentStatus: parsed.payment_status,
      feedback: parsed.feedback || null,
      submissionCount: parsed.submission_count || 0,
      submittedBy: parsed.submitted_by || null,
      submittedAt: parsed.submitted_at || null,
      reviewedBy: parsed.reviewed_by || null,
      reviewedAt: parsed.reviewed_at || null,
    };
  }

  async updateMilestone(milestoneId: string, dto: CreateMilestoneDto, updatedBy?: string) {
    // Verify milestone exists and get project ID
    const rawMilestone = await this.getMilestoneRaw(milestoneId);
    const projectId = rawMilestone.project_id;

    // Prepare update data
    const updateData: any = {
      name: dto.name,
      description: dto.description || null,
      milestone_type: dto.milestoneType,
      order_index: dto.orderIndex,
      deliverables: JSON.stringify(dto.deliverables || []),
      acceptance_criteria: JSON.stringify(dto.acceptanceCriteria || []),
      estimated_hours: dto.estimatedHours || null,
      due_date: dto.dueDate || null,
      milestone_amount: dto.milestoneAmount || null,
      updated_at: new Date().toISOString(),
    };

    // Update the milestone
    await this.db.update('project_milestones', milestoneId, updateData);

    // Return updated milestone
    const updatedMilestone = await this.getMilestone(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(projectId, 'milestone-updated', updatedMilestone, updatedBy);

    // Send push notification to project members
    try {
      const project = await this.getProject(projectId);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Collect all user IDs to notify (excluding the updater)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== updatedBy);

      // Add client to notifications if not already included and not the updater
      if (project.client_id && project.client_id !== updatedBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      if (notifyUserIds.length > 0 && updatedBy) {
        const updater = await this.db.getUserById(updatedBy);
        const notificationTitle = `📝 Milestone Updated: ${dto.name}`;
        const notificationMessage = `${updater?.name || 'A team member'} updated milestone "${dto.name}" in project "${project.name}".`;

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/milestone-approval`,
            data: {
              projectId,
              companyId: userCompanyId,
              milestoneId,
              milestoneTitle: dto.name,
            },
            send_push: true,
          });
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone update notification:', error);
    }

    return updatedMilestone;
  }

  async updateMilestoneStatus(milestoneId: string, status: MilestoneStatus) {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === MilestoneStatus.COMPLETED) {
      updateData.completed_date = new Date().toISOString();
    }

    await this.db.update('project_milestones', milestoneId, updateData);

    const updatedMilestone = await this.getMilestone(milestoneId);

    // Get project ID for WebSocket event
    const rawMilestone = await this.getMilestoneRaw(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(rawMilestone.project_id, 'milestone-updated', updatedMilestone);

    return updatedMilestone;
  }

  async approveMilestone(milestoneId: string, approvedBy: string, dto: ApproveMilestoneDto) {
    // Get milestone details before updating
    const milestone = await this.getMilestoneRaw(milestoneId);

    const updateData = {
      status: MilestoneStatus.APPROVED,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      approval_notes: dto.notes || null,
      updated_at: new Date().toISOString(),
    };

    await this.db.update('project_milestones', milestoneId, updateData);

    // Send notification to project members with per-user company context
    try {
      const project = await this.getProject(milestone.project_id);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: milestone.project_id,
      });

      // Notify the developer who submitted the milestone
      if (milestone.submitted_by) {
        const submitterCompanyId = await this.getCompanyIdForUser(milestone.submitted_by, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: milestone.submitted_by,
          type: NotificationType.ACHIEVEMENT,
          title: '🎉 Milestone Approved!',
          message: `Great news! Your milestone "${milestone.name}" in project "${project.name}" has been approved.${dto.notes ? ` Note: ${dto.notes}` : ''}`,
          priority: NotificationPriority.HIGH,
          action_url: `/company/${submitterCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: submitterCompanyId, milestoneId, milestoneName: milestone.name, approved: true },
          send_push: true,
        });
      }

      // Also notify all other team members about the milestone approval
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== approvedBy && id !== milestone.submitted_by);

      // Add client if not already included
      if (project.client_id && project.client_id !== approvedBy && project.client_id !== milestone.submitted_by && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      for (const userId of notifyUserIds) {
        const userCompanyId = await this.getCompanyIdForUser(userId, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: userId,
          type: NotificationType.UPDATE,
          title: '✅ Milestone Approved',
          message: `Milestone "${milestone.name}" in project "${project.name}" has been approved.`,
          priority: NotificationPriority.NORMAL,
          action_url: `/company/${userCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: userCompanyId, milestoneId, milestoneName: milestone.name },
          send_push: true,
        });
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone approval notification:', error);
    }

    const approvedMilestone = await this.getMilestone(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(milestone.project_id, 'milestone-approved', approvedMilestone, approvedBy);

    return approvedMilestone;
  }

  async submitMilestone(milestoneId: string, userId: string, dto: SubmitMilestoneDto) {
    // Verify milestone exists
    const milestone = await this.getMilestoneRaw(milestoneId);

    // Verify status is in_progress or feedback_required (for resubmission after client feedback)
    if (milestone.status !== MilestoneStatus.IN_PROGRESS && milestone.status !== MilestoneStatus.FEEDBACK_REQUIRED) {
      throw new BadRequestException('Milestone must be in progress or require feedback to submit');
    }

    // Verify user is team member
    const isTeamMember = await this.isProjectTeamMember(userId, milestone.project_id);
    if (!isTeamMember) {
      throw new ForbiddenException('Only team members can submit milestones');
    }

    // Update milestone
    const updateData = {
      status: MilestoneStatus.SUBMITTED,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      submission_count: (milestone.submission_count || 0) + 1,
      feedback: null, // Clear previous feedback when resubmitting
      updated_at: new Date().toISOString(),
    };

    await this.db.update('project_milestones', milestoneId, updateData);

    // Send notification to project client about milestone submission with per-user company context
    try {
      const project = await this.getProject(milestone.project_id);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: milestone.project_id,
      });

      if (project.client_id) {
        const clientCompanyId = await this.getCompanyIdForUser(project.client_id, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: project.client_id,
          type: NotificationType.UPDATE,
          title: '📤 Milestone Submitted for Review',
          message: `The milestone "${milestone.name}" in project "${project.name}" has been submitted and is ready for your review.`,
          priority: NotificationPriority.HIGH,
          action_url: `/company/${clientCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: clientCompanyId, milestoneId, milestoneName: milestone.name },
          send_push: true,
        });
      }

      // Also notify other team members
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== userId && id !== project.client_id);

      for (const notifyUserId of notifyUserIds) {
        const userCompanyId = await this.getCompanyIdForUser(notifyUserId, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: notifyUserId,
          type: NotificationType.UPDATE,
          title: '📤 Milestone Submitted',
          message: `Milestone "${milestone.name}" in project "${project.name}" has been submitted for review.`,
          priority: NotificationPriority.NORMAL,
          action_url: `/company/${userCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: userCompanyId, milestoneId, milestoneName: milestone.name },
          send_push: true,
        });
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone submission notification:', error);
    }

    const submittedMilestone = await this.getMilestone(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(milestone.project_id, 'milestone-submitted', submittedMilestone, userId);

    return submittedMilestone;
  }

  async submitMilestoneWithFile(projectId: string, milestoneId: string, userId: string, body: any) {
    // Verify milestone exists
    const milestone = await this.getMilestoneRaw(milestoneId);

    // Verify status is in_progress or feedback_required (for resubmission after client feedback)
    if (milestone.status !== MilestoneStatus.IN_PROGRESS && milestone.status !== MilestoneStatus.FEEDBACK_REQUIRED) {
      throw new BadRequestException('Milestone must be in progress or require feedback to submit');
    }

    // Verify user is team member
    const isTeamMember = await this.isProjectTeamMember(userId, milestone.project_id);
    if (!isTeamMember) {
      throw new ForbiddenException('Only team members can submit milestones');
    }

    // Parse existing deliverables array
    let deliverables = [];
    try {
      deliverables = typeof milestone.deliverables === 'string'
        ? JSON.parse(milestone.deliverables)
        : (milestone.deliverables || []);
    } catch (error) {
      deliverables = [];
    }

    // Handle file upload if provided
    if (body.file) {
      // Upload file to storage
      const fileType = this.getFileType(body.file.mimetype);
      const bucket = 'project-files';
      const fileName = `${projectId}/milestones/${milestoneId}/deliverables/${Date.now()}-${body.file.originalname}`;

      const uploadResult = await /* TODO: use StorageService */ this.db.uploadFile(
        bucket,
        body.file.buffer,
        fileName,
        { contentType: body.file.mimetype },
      );

      console.log("uploadresutks",uploadResult)

      // Get file URL from upload result - extract publicUrl and decode if needed
      const publicUrl = typeof uploadResult === 'string'
        ? uploadResult
        : (uploadResult.publicUrl || uploadResult.url);
      const fileUrl = decodeURIComponent(publicUrl);

      // Add file to deliverables array
      deliverables.push({
        title: body.file.originalname,
        description: body.notes || 'Milestone submission deliverable',
        fileUrl: fileUrl,
        fileName: body.file.originalname,
        fileSize: body.file.size,
        mimeType: body.file.mimetype,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId,
      });

      // Also store in project_files table for reference
      const fileData = {
        project_id: projectId,
        milestone_id: milestoneId,
        file_name: body.file.originalname,
        file_path: fileName,
        file_url: fileUrl,
        file_size: body.file.size,
        mime_type: body.file.mimetype,
        file_type: fileType,
        uploaded_by: userId,
        description: body.notes || 'Milestone submission deliverable',
        tags: JSON.stringify([]),
        version: 1,
        is_deliverable: true,
        is_public: false,
        shared_with: JSON.stringify([]),
        metadata: JSON.stringify({}),
      };

      await this.db.insert('project_files', fileData);
    }

    // Update milestone with new deliverables and submission status
    const updateData: any = {
      status: MilestoneStatus.SUBMITTED,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      submission_count: (milestone.submission_count || 0) + 1,
      feedback: null, // Clear previous feedback when resubmitting
      updated_at: new Date().toISOString(),
    };

    // Only update deliverables if a file was uploaded
    if (body.file) {
      updateData.deliverables = JSON.stringify(deliverables);
    }

    await this.db.update('project_milestones', milestoneId, updateData);

    const submittedMilestone = await this.getMilestone(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(projectId, 'milestone-submitted', submittedMilestone, userId);

    return submittedMilestone;
  }

  async requestMilestoneFeedback(milestoneId: string, userId: string, dto: RequestMilestoneFeedbackDto) {
    // Verify milestone exists
    const milestone = await this.getMilestoneRaw(milestoneId);

    // Verify status is submitted
    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      throw new BadRequestException('Can only request feedback on submitted milestones');
    }

    // Verify user is project client
    const isClient = await this.isProjectClient(userId, milestone.project_id);
    if (!isClient) {
      throw new ForbiddenException('Only project owner can request feedback');
    }

    // Update milestone
    const updateData = {
      status: MilestoneStatus.FEEDBACK_REQUIRED,
      feedback: dto.feedback,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.update('project_milestones', milestoneId, updateData);

    // Send notification to the developer who submitted the milestone with per-user company context
    try {
      const project = await this.getProject(milestone.project_id);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: milestone.project_id,
      });

      if (milestone.submitted_by) {
        const submitterCompanyId = await this.getCompanyIdForUser(milestone.submitted_by, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: milestone.submitted_by,
          type: NotificationType.REMINDER,
          title: '⚠️ Changes Requested on Milestone',
          message: `The client has requested changes to milestone "${milestone.name}" in project "${project.name}". Feedback: ${dto.feedback.substring(0, 150)}${dto.feedback.length > 150 ? '...' : ''}`,
          priority: NotificationPriority.HIGH,
          action_url: `/company/${submitterCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: submitterCompanyId, milestoneId, milestoneName: milestone.name, feedback: dto.feedback },
          send_push: true,
        });
      }

      // Notify all other team members about feedback required
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== userId && id !== milestone.submitted_by);

      for (const notifyUserId of notifyUserIds) {
        const userCompanyId = await this.getCompanyIdForUser(notifyUserId, milestone.project_id, project, projectMembers);
        await this.notificationsService.sendNotification({
          user_id: notifyUserId,
          type: NotificationType.REMINDER,
          title: '⚠️ Milestone Needs Revision',
          message: `Client requested changes to milestone "${milestone.name}" in project "${project.name}".`,
          priority: NotificationPriority.NORMAL,
          action_url: `/company/${userCompanyId}/project/${project.id}/milestone-approval`,
          data: { projectId: project.id, companyId: userCompanyId, milestoneId, milestoneName: milestone.name },
          send_push: true,
        });
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone feedback notification:', error);
    }

    const feedbackMilestone = await this.getMilestone(milestoneId);

    // Emit WebSocket event for real-time updates
    this.emitMilestoneEvent(milestone.project_id, 'milestone-feedback-required', feedbackMilestone, userId);

    return feedbackMilestone;
  }

  async updateMilestonePayment(milestoneId: string, paymentStatus: string, paymentDate?: string) {
    const updateData: any = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (paymentDate) {
      updateData.payment_date = paymentDate;
    }

    await this.db.update('project_milestones', milestoneId, updateData);
    return this.getMilestone(milestoneId);
  }

  async deleteMilestone(milestoneId: string, deletedBy?: string) {
    // Verify milestone exists and get project_id for WebSocket event
    const milestone = await this.getMilestoneRaw(milestoneId);
    const projectId = milestone.project_id;
    const milestoneName = milestone.name;

    // Delete the milestone
    await this.db.delete('project_milestones', milestoneId);

    // Emit WebSocket event for real-time updates
    this.gateway.sendToProject(projectId, 'milestone-deleted', {
      milestoneId,
      userId: deletedBy,
      timestamp: new Date().toISOString(),
    });

    // Send push notification to project members
    try {
      const project = await this.getProject(projectId);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Collect all user IDs to notify (excluding the deleter)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== deletedBy);

      // Add client to notifications if not already included and not the deleter
      if (project.client_id && project.client_id !== deletedBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      if (notifyUserIds.length > 0 && deletedBy) {
        const deleter = await this.db.getUserById(deletedBy);
        const notificationTitle = `🗑️ Milestone Deleted: ${milestoneName}`;
        const notificationMessage = `${deleter?.name || 'A team member'} deleted milestone "${milestoneName}" from project "${project.name}".`;

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/milestone-approval`,
            data: {
              projectId,
              companyId: userCompanyId,
              milestoneId,
              milestoneTitle: milestoneName,
              deleted: true,
            },
            send_push: true,
          });
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send milestone deletion notification:', error);
    }

    return {
      success: true,
      message: 'Milestone deleted successfully',
    };
  }

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  async createTask(projectId: string, milestoneId: string | null, dto: CreateTaskDto, createdBy?: string) {
    // Verify project exists and check status
    const project = await this.getProject(projectId);

    // Block creation on completed or ended projects
    if (project.status === 'completed' || project.status === 'ended') {
      throw new BadRequestException('Cannot create tasks on completed or ended projects');
    }

    // Verify milestone exists if provided
    if (milestoneId) {
      await this.getMilestoneRaw(milestoneId);
    }

    // Validate parent task if creating a subtask
    let parentTaskId = null;
    if (dto.parentTaskId) {
      const parentTask = await this.db.findOne('project_tasks', { id: dto.parentTaskId });
      if (!parentTask) {
        throw new BadRequestException('Parent task not found');
      }
      // Prevent nested subtasks - if parent already has a parent, reject
      if (parentTask.parent_task_id) {
        throw new BadRequestException('Cannot create nested subtasks. The selected task is already a subtask.');
      }
      // Ensure parent task belongs to same project
      if (parentTask.project_id !== projectId) {
        throw new BadRequestException('Parent task must belong to the same project');
      }
      parentTaskId = dto.parentTaskId;
    }

    const taskData = {
      project_id: projectId,
      milestone_id: milestoneId,
      parent_task_id: parentTaskId,
      title: dto.title,
      description: dto.description || null,
      task_type: dto.taskType,
      priority: dto.priority || 'medium',
      status: TaskStatus.INITIALIZED,
      assigned_to: dto.assignedTo || null,
      assigned_by: createdBy || null,
      assigned_at: dto.assignedTo ? new Date().toISOString() : null,
      estimated_hours: dto.estimatedHours || null,
      actual_hours: 0,
      due_date: dto.dueDate || null,
      tags: JSON.stringify(dto.tags || []),
      dependencies: JSON.stringify(dto.dependencies || []),
      attachments: JSON.stringify([]),
      checklist: JSON.stringify([]),
    };

    const task = await this.db.insert('project_tasks', taskData);
    const parsedTask = this.parseTaskJson(task);

    // Enrich task with user names
    const enrichedTask = await this.enrichTaskWithUserNames(parsedTask, projectId);

    // Emit WebSocket event for real-time updates
    this.emitTaskEvent(projectId, 'task-created', enrichedTask, createdBy);

    // If the task has a milestone, recalculate and emit milestone progress
    if (milestoneId) {
      try {
        const updatedProgress = await this.calculateMilestoneProgress(milestoneId);
        const milestone = await this.getMilestone(milestoneId);

        // Emit milestone-updated event with new progress
        this.emitMilestoneEvent(projectId, 'milestone-updated', milestone, createdBy);
      } catch (error) {
        console.error('[ProjectService] Failed to update milestone progress after task creation:', error);
      }
    }

    // Send push notifications to project members
    try {
      console.log('[ProjectService] createTask - Sending notifications for task:', dto.title);
      console.log('[ProjectService] createTask - createdBy:', createdBy);
      console.log('[ProjectService] createTask - projectId:', projectId);

      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      console.log('[ProjectService] createTask - projectMembers:', projectMembers.length, projectMembers.map((m: any) => m.user_id));

      // Collect all user IDs to notify (excluding creator)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== createdBy);

      // Add client to notifications if not already included and not the creator
      if (project.client_id && project.client_id !== createdBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      console.log('[ProjectService] createTask - notifyUserIds:', notifyUserIds);
      console.log('[ProjectService] createTask - project.client_id:', project.client_id);

      if (notifyUserIds.length > 0 && createdBy) {
        console.log('[ProjectService] createTask - Sending notifications to', notifyUserIds.length, 'users');
        const creator = await this.db.getUserById(createdBy);
        const priorityEmoji = dto.priority === 'high' || dto.priority === 'urgent' ? '🔴' : dto.priority === 'low' ? '🔵' : '📌';
        const notificationTitle = `${priorityEmoji} New Task: ${dto.title}`;
        const notificationMessage = `${creator?.name || 'A team member'} created a new task "${dto.title}" in project "${project.name}".`;

        // Build action URL based on whether task has milestone
        const taskPath = milestoneId
          ? `milestone/${milestoneId}/tasks`
          : 'tasks';

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);
          console.log('[ProjectService] createTask - Sending notification to userId:', userId, 'companyId:', userCompanyId);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: dto.priority === 'high' || dto.priority === 'urgent' ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/${taskPath}`,
            data: {
              projectId,
              companyId: userCompanyId,
              taskId: task.id,
              milestoneId,
              taskTitle: dto.title,
              priority: dto.priority,
            },
            send_push: true,
          });
          console.log('[ProjectService] createTask - Notification sent successfully to:', userId);
        }
      } else {
        console.log('[ProjectService] createTask - No users to notify or createdBy is missing');
        console.log('[ProjectService] createTask - notifyUserIds.length:', notifyUserIds.length, 'createdBy:', createdBy);
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send task creation notification:', error);
    }

    return enrichedTask;
  }

  async getProjectTasks(projectId: string, filters?: {
    milestoneId?: string;
    assignedTo?: string;
    status?: TaskStatus;
    priority?: string;
  }) {
    const conditions: any = { project_id: projectId };

    if (filters?.milestoneId) {
      conditions.milestone_id = filters.milestoneId;
    }
    if (filters?.assignedTo) {
      conditions.assigned_to = filters.assignedTo;
    }
    if (filters?.status) {
      conditions.status = filters.status;
    }
    if (filters?.priority) {
      conditions.priority = filters.priority;
    }

    const tasks = await this.db.findMany(
      'project_tasks',
      conditions,
      { orderBy: 'created_at', order: 'desc' }
    );

    // Collect all unique user IDs from assigned_to and updated_by
    const userIds: string[] = [...new Set(
      tasks
        .flatMap((t: any) => [t.assigned_to, t.updated_by])
        .filter(Boolean)
    )] as string[];

    // Fetch user names from project_members joined with company_team_members
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      // First try to get from project_members with user info
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Get company team member info for these users
      for (const userId of userIds) {
        const projectMember = projectMembers.find((pm: any) => pm.user_id === userId);
        if (projectMember && projectMember.company_id) {
          const companyMember = await this.db.findOne('company_team_members', {
            company_id: projectMember.company_id,
            user_id: userId,
          });
          if (companyMember) {
            userMap[userId] = companyMember.name;
          }
        }

        // Fallback: try team_members table
        if (!userMap[userId]) {
          const teamMember = await this.db.findOne('team_members', {
            user_id: userId,
          });
          if (teamMember) {
            userMap[userId] = teamMember.display_name;
          }
        }
      }
    }

    // Enrich tasks with user names
    return tasks.map(t => {
      const parsedTask = this.parseTaskJson(t);
      return {
        ...parsedTask,
        assigned_to_name: t.assigned_to ? userMap[t.assigned_to] || null : null,
        updated_by_name: t.updated_by ? userMap[t.updated_by] || null : null,
      };
    });
  }

  async getTask(taskId: string) {
    const task = await this.db.findOne('project_tasks', { id: taskId });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return this.parseTaskJson(task);
  }

  /**
   * Get user name by user ID
   * Tries company_team_members first, then falls back to team_members
   */
  private async getUserNameById(userId: string, projectId?: string): Promise<string | null> {
    if (!userId) return null;

    // Try to get from project members -> company team members
    if (projectId) {
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      const projectMember = projectMembers.find((pm: any) => pm.user_id === userId);
      if (projectMember && projectMember.company_id) {
        const companyMember = await this.db.findOne('company_team_members', {
          company_id: projectMember.company_id,
          user_id: userId,
        });
        if (companyMember) {
          return companyMember.name;
        }
      }
    }

    // Fallback: try team_members table
    const teamMember = await this.db.findOne('team_members', {
      user_id: userId,
    });
    if (teamMember) {
      return teamMember.display_name;
    }

    return null;
  }

  /**
   * Enrich a task with user names for assigned_to and updated_by
   */
  private async enrichTaskWithUserNames(task: any, projectId: string): Promise<any> {
    const [assignedToName, updatedByName] = await Promise.all([
      task.assigned_to ? this.getUserNameById(task.assigned_to, projectId) : null,
      task.updated_by ? this.getUserNameById(task.updated_by, projectId) : null,
    ]);

    return {
      ...task,
      assigned_to_name: assignedToName,
      updated_by_name: updatedByName,
    };
  }

  /**
   * Get tasks with enriched assignee information
   * Returns tasks in the format expected by the frontend
   */
  async getProjectTasksEnriched(projectId: string) {
    // Verify project exists
    await this.getProject(projectId);

    // Fetch all tasks for the project
    const tasksQuery = this.db.table('project_tasks')
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc');

    const tasksResult = await tasksQuery.execute();
    const tasks = tasksResult.data || [];

    // Get unique assignee IDs
    const assigneeIds = [...new Set(
      tasks
        .filter(t => t.assigned_to)
        .map(t => t.assigned_to)
    )];

    // Fetch team members for assignees
    let teamMembers = [];
    if (assigneeIds.length > 0) {
      const teamMembersQuery = this.db.table('team_members')
        .whereIn('user_id', assigneeIds)
        .where('is_active', '=', true);

      const teamMembersResult = await teamMembersQuery.execute();
      teamMembers = teamMembersResult.data || [];
    }

    // Map tasks to response format with assignee details
    const enrichedTasks = tasks.map(task => {
      const assignee = task.assigned_to
        ? teamMembers.find(tm => tm.user_id === task.assigned_to)
        : null;

      return {
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status,
        assignee: assignee ? {
          id: assignee.user_id,
          name: assignee.display_name,
          avatar: assignee.profile_image || '/default-avatar.png',
        } : null,
        dueDate: task.due_date || null,
        priority: task.priority,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      };
    });

    return {
      tasks: enrichedTasks,
    };
  }

  async updateTask(taskId: string, dto: UpdateTaskDto, updatedBy?: string) {
    // Get the task first to get projectId and milestoneId for WebSocket
    const existingTask = await this.getTask(taskId);
    const projectId = existingTask.project_id;
    const milestoneId = existingTask.milestone_id;

    const updateData: any = {};

    if (dto.title) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.taskType) updateData.task_type = dto.taskType;
    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === TaskStatus.DONE) {
        updateData.completed_date = new Date().toISOString();
      }
    }
    if (dto.priority) updateData.priority = dto.priority;
    if (dto.assignedTo !== undefined) {
      updateData.assigned_to = dto.assignedTo || null;
      if (dto.assignedTo) {
        updateData.assigned_at = new Date().toISOString();
      }
    }
    if (dto.estimatedHours !== undefined) {
      updateData.estimated_hours = dto.estimatedHours;
    }
    if (dto.actualHours !== undefined) {
      updateData.actual_hours = dto.actualHours;
    }
    if (dto.dueDate !== undefined) {
      updateData.due_date = dto.dueDate || null;
    }
    if (dto.tags) updateData.tags = JSON.stringify(dto.tags);
    if (dto.dependencies) updateData.dependencies = JSON.stringify(dto.dependencies);

    // Handle parent task update with validation
    if (dto.parentTaskId !== undefined) {
      if (dto.parentTaskId) {
        // Check if this task already has subtasks - if so, it can't become a subtask
        const subtasks = await this.db.findMany('project_tasks', { parent_task_id: taskId });
        if (subtasks && subtasks.length > 0) {
          throw new BadRequestException('Cannot set parent for a task that already has subtasks');
        }

        // Check if the new parent is valid
        const parentTask = await this.db.findOne('project_tasks', { id: dto.parentTaskId });
        if (!parentTask) {
          throw new BadRequestException('Parent task not found');
        }
        if (parentTask.parent_task_id) {
          throw new BadRequestException('Cannot create nested subtasks. The selected task is already a subtask.');
        }
        if (parentTask.project_id !== projectId) {
          throw new BadRequestException('Parent task must belong to the same project');
        }
        if (dto.parentTaskId === taskId) {
          throw new BadRequestException('A task cannot be its own parent');
        }
        updateData.parent_task_id = dto.parentTaskId;
      } else {
        // Remove parent (convert subtask to regular task)
        updateData.parent_task_id = null;
      }
    }

    updateData.updated_at = new Date().toISOString();
    if (updatedBy) {
      updateData.updated_by = updatedBy;
    }

    await this.db.update('project_tasks', taskId, updateData);
    const updatedTask = await this.getTask(taskId);

    // Enrich task with user names for real-time updates
    const enrichedTask = await this.enrichTaskWithUserNames(updatedTask, projectId);

    // Emit WebSocket event for real-time updates
    this.emitTaskEvent(projectId, 'task-updated', enrichedTask, updatedBy);

    // If the task has a milestone and status changed, recalculate and emit milestone progress
    if (milestoneId && dto.status) {
      try {
        const updatedProgress = await this.calculateMilestoneProgress(milestoneId);
        const milestone = await this.getMilestone(milestoneId);

        // Emit milestone-updated event with new progress
        this.emitMilestoneEvent(projectId, 'milestone-updated', milestone, updatedBy);
      } catch (error) {
        console.error('[ProjectService] Failed to update milestone progress after task update:', error);
      }
    }

    // Send push notifications to project members
    try {
      const project = await this.getProject(projectId);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Collect all user IDs to notify (excluding the updater)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== updatedBy);

      // Add client to notifications if not already included and not the updater
      if (project.client_id && project.client_id !== updatedBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      if (notifyUserIds.length > 0 && updatedBy) {
        const updater = await this.db.getUserById(updatedBy);
        const taskTitle = dto.title || existingTask.title;

        // Determine what changed for the notification
        let changeDescription = 'was updated';
        if (dto.status) {
          changeDescription = `status changed to ${dto.status}`;
        } else if (dto.assignedTo !== undefined) {
          changeDescription = dto.assignedTo ? 'was reassigned' : 'assignment was removed';
        }

        const notificationTitle = `📝 Task Updated: ${taskTitle}`;
        const notificationMessage = `${updater?.name || 'A team member'} updated task "${taskTitle}" (${changeDescription}) in project "${project.name}".`;

        // Build action URL based on whether task has milestone
        const taskPath = milestoneId
          ? `milestone/${milestoneId}/tasks`
          : 'tasks';

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/${taskPath}`,
            data: {
              projectId,
              companyId: userCompanyId,
              taskId,
              milestoneId,
              taskTitle,
            },
            send_push: true,
          });
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send task update notification:', error);
    }

    return enrichedTask;
  }

  async deleteTask(taskId: string, deletedBy?: string) {
    // Get the task first to get projectId and milestoneId for WebSocket/notifications
    const task = await this.getTask(taskId);
    const projectId = task.project_id;
    const milestoneId = task.milestone_id;
    const taskTitle = task.title;

    await this.db.delete('project_tasks', taskId);

    // Emit WebSocket event for real-time updates
    this.gateway.sendToProject(projectId, 'task-deleted', {
      taskId,
      milestoneId,
      userId: deletedBy,
      timestamp: new Date().toISOString(),
    });

    // If the task had a milestone, recalculate and emit milestone progress
    if (milestoneId) {
      try {
        const updatedProgress = await this.calculateMilestoneProgress(milestoneId);
        const milestone = await this.getMilestone(milestoneId);

        // Emit milestone-updated event with new progress
        this.emitMilestoneEvent(projectId, 'milestone-updated', milestone, deletedBy);
      } catch (error) {
        console.error('[ProjectService] Failed to update milestone progress after task deletion:', error);
      }
    }

    // Send push notifications to project members
    try {
      const project = await this.getProject(projectId);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Collect all user IDs to notify (excluding the deleter)
      const notifyUserIds = projectMembers
        .map((m: any) => m.user_id)
        .filter((id: string) => id && id !== deletedBy);

      // Add client to notifications if not already included and not the deleter
      if (project.client_id && project.client_id !== deletedBy && !notifyUserIds.includes(project.client_id)) {
        notifyUserIds.push(project.client_id);
      }

      if (notifyUserIds.length > 0 && deletedBy) {
        const deleter = await this.db.getUserById(deletedBy);
        const notificationTitle = `🗑️ Task Deleted: ${taskTitle}`;
        const notificationMessage = `${deleter?.name || 'A team member'} deleted task "${taskTitle}" from project "${project.name}".`;

        // Build action URL based on whether task had milestone
        const taskPath = milestoneId
          ? `milestone/${milestoneId}/tasks`
          : 'tasks';

        // Send individual notifications with correct company context per user
        for (const userId of notifyUserIds) {
          const userCompanyId = await this.getCompanyIdForUser(userId, projectId, project, projectMembers);

          await this.notificationsService.sendNotification({
            user_id: userId,
            type: NotificationType.UPDATE,
            title: notificationTitle,
            message: notificationMessage,
            priority: NotificationPriority.NORMAL,
            action_url: `/company/${userCompanyId}/project/${projectId}/${taskPath}`,
            data: {
              projectId,
              companyId: userCompanyId,
              taskId,
              milestoneId,
              taskTitle,
              deleted: true,
            },
            send_push: true,
          });
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to send task deletion notification:', error);
    }

    return { success: true, message: 'Task deleted successfully' };
  }

  async assignTask(taskId: string, assignedTo: string, assignedBy: string) {
    // Get task before updating to get project info
    const task = await this.getTask(taskId);
    const projectId = task.project_id;
    const milestoneId = task.milestone_id;

    const updateData = {
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.update('project_tasks', taskId, updateData);
    const updatedTask = await this.getTask(taskId);

    // Enrich task with user names
    const enrichedTask = await this.enrichTaskWithUserNames(updatedTask, projectId);

    // Emit WebSocket event for real-time updates
    this.gateway.sendToProject(projectId, 'task-assigned', {
      task: enrichedTask,
      assignedBy,
      assignedTo,
      timestamp: new Date().toISOString(),
    });

    // Send notification to assignee
    try {
      const project = await this.getProject(projectId);
      const projectMembers = await this.db.findMany('project_members', {
        project_id: projectId,
      });

      // Get company ID for the assignee
      const userCompanyId = await this.getCompanyIdForUser(assignedTo, projectId, project, projectMembers);

      // Build action URL based on whether task has milestone
      const taskPath = milestoneId
        ? `milestone/${milestoneId}/tasks`
        : 'tasks';

      await this.notificationsService.sendNotification({
        user_id: assignedTo,
        type: NotificationType.REMINDER,
        title: 'Task Assigned to You',
        message: `You have been assigned the task "${task.title}" in project "${project.name}".`,
        priority: task.priority === 'high' || task.priority === 'urgent' ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
        action_url: `/company/${userCompanyId}/project/${projectId}/${taskPath}`,
        data: {
          projectId,
          companyId: userCompanyId,
          taskId,
          milestoneId,
          taskTitle: task.title,
          priority: task.priority
        },
        send_push: true,
      });
    } catch (error) {
      console.error('[ProjectService] Failed to send task assignment notification:', error);
    }

    return enrichedTask;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private parseProjectJson(project: any) {
    if (!project) return null;

    return {
      ...project,
      requirements: this.safeJsonParse(project.requirements),
      tech_stack: this.safeJsonParse(project.tech_stack),
      frameworks: this.safeJsonParse(project.frameworks),
      features: this.safeJsonParse(project.features),
      assigned_team: this.safeJsonParse(project.assigned_team),
      settings: this.safeJsonParse(project.settings),
      metadata: this.safeJsonParse(project.metadata),
    };
  }

  private parseMilestoneJson(milestone: any) {
    if (!milestone) return null;

    return {
      ...milestone,
      deliverables: this.safeJsonParse(milestone.deliverables),
      acceptance_criteria: this.safeJsonParse(milestone.acceptance_criteria),
    };
  }

  private parseTaskJson(task: any) {
    if (!task) return null;

    return {
      ...task,
      // Add camelCase versions for frontend compatibility
      milestoneId: task.milestone_id,
      projectId: task.project_id,
      assignedTo: task.assigned_to,
      assignedBy: task.assigned_by,
      dueDate: task.due_date,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      tags: this.safeJsonParse(task.tags),
      dependencies: this.safeJsonParse(task.dependencies),
      attachments: this.safeJsonParse(task.attachments),
      checklist: this.safeJsonParse(task.checklist),
    };
  }

  private safeJsonParse(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private parseFileJson(file: any) {
    if (!file) return null;

    // Transform snake_case to camelCase for frontend compatibility
    return {
      id: file.id,
      projectId: file.project_id,
      milestoneId: file.milestone_id,
      fileName: file.file_name,
      filePath: file.file_path,
      fileUrl: file.file_url,
      fileSize: file.file_size,
      mimeType: file.mime_type,
      fileType: file.file_type,
      uploadedBy: file.uploaded_by,
      uploadedAt: file.uploaded_at,
      description: file.description,
      tags: this.safeJsonParse(file.tags),
      version: file.version,
      isDeliverable: file.is_deliverable,
      deliverableIndex: file.deliverable_index,
      thumbnailUrl: file.thumbnail_url,
      isPublic: file.is_public,
      sharedWith: this.safeJsonParse(file.shared_with),
      metadata: this.safeJsonParse(file.metadata),
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      deletedAt: file.deleted_at,
    };
  }

  private getFileType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    if (mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('code')) return 'code';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compressed')) return 'archive';
    return 'other';
  }

  // ============================================
  // FILE MANAGEMENT
  // ============================================

  async uploadProjectFile(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
    dto: any,
  ) {
    // Verify project exists and check status
    const project = await this.getProject(projectId);

    // Block file upload on completed or ended projects
    if (project.status === 'completed' || project.status === 'ended') {
      throw new BadRequestException('Cannot upload files to completed or ended projects');
    }

    // Determine file type based on MIME type
    const fileType = this.getFileType(file.mimetype);

    // Upload file to storage
    const bucket = 'project-files';
    const fileName = `${projectId}/${Date.now()}-${file.originalname}`;
    const uploadResult = await /* TODO: use StorageService */ this.db.uploadFile(
      bucket,
      file.buffer,
      fileName,
      { contentType: file.mimetype },
    );

    // Use the URL returned directly from the upload result (CDN URL)
    const fileUrl = uploadResult?.url || '';
    // Store the key/path for future reference
    const storagePath = uploadResult?.key || fileName;

    // Store file metadata in database
    const fileData = {
      project_id: projectId,
      milestone_id: dto.milestoneId || null,
      file_name: file.originalname,
      file_path: storagePath,
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.mimetype,
      file_type: fileType,
      uploaded_by: userId,
      description: dto.description || null,
      tags: JSON.stringify(dto.tags || []),
      version: 1,
      is_deliverable: false,
      is_public: dto.isPublic || false,
      shared_with: JSON.stringify(dto.sharedWith || []),
      metadata: JSON.stringify({}),
    };

    const fileRecord = await this.db.insert('project_files', fileData);
    return this.parseFileJson(fileRecord);
  }

  async uploadMilestoneDeliverable(
    projectId: string,
    milestoneId: string,
    userId: string,
    file: Express.Multer.File,
    dto: any,
  ) {
    // Verify project and milestone exist
    await this.getProject(projectId);
    await this.getMilestoneRaw(milestoneId);

    // Upload file
    const fileType = this.getFileType(file.mimetype);
    const bucket = 'project-files';
    const fileName = `${projectId}/milestones/${milestoneId}/${Date.now()}-${file.originalname}`;
    const uploadResult = await /* TODO: use StorageService */ this.db.uploadFile(
      bucket,
      file.buffer,
      fileName,
      { contentType: file.mimetype },
    );

    // Use the URL returned directly from the upload result (CDN URL)
    const fileUrl = uploadResult?.url || '';
    // Store the key/path for future reference
    const storagePath = uploadResult?.key || fileName;

    // Store file metadata
    const fileData = {
      project_id: projectId,
      milestone_id: milestoneId,
      file_name: file.originalname,
      file_path: storagePath,
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.mimetype,
      file_type: fileType,
      uploaded_by: userId,
      description: dto.description || null,
      tags: JSON.stringify(dto.tags || []),
      version: 1,
      is_deliverable: true,
      deliverable_index: dto.deliverableIndex,
      is_public: false,
      shared_with: JSON.stringify([]),
      metadata: JSON.stringify({}),
    };

    const fileRecord = await this.db.insert('project_files', fileData);

    // Update milestone deliverables array
    const milestone = await this.getMilestoneRaw(milestoneId);
    const deliverables = milestone.deliverables || [];
    if (deliverables[dto.deliverableIndex]) {
      deliverables[dto.deliverableIndex].fileUrl = fileUrl;
      deliverables[dto.deliverableIndex].fileName = file.originalname;
      deliverables[dto.deliverableIndex].fileSize = file.size;
      deliverables[dto.deliverableIndex].uploadedAt = new Date().toISOString();

      await this.db.update('project_milestones', milestoneId, {
        deliverables: JSON.stringify(deliverables),
        updated_at: new Date().toISOString(),
      });
    }

    return this.parseFileJson(fileRecord);
  }

  async getProjectFiles(projectId: string, filters?: any) {
    const conditions: any = {
      project_id: projectId,
      deleted_at: null,
    };

    if (filters?.milestoneId) {
      conditions.milestone_id = filters.milestoneId;
    }
    if (filters?.fileType) {
      conditions.file_type = filters.fileType;
    }
    if (filters?.uploadedBy) {
      conditions.uploaded_by = filters.uploadedBy;
    }
    if (filters?.isDeliverable !== undefined) {
      conditions.is_deliverable = filters.isDeliverable;
    }

    const files = await this.db.findMany(
      'project_files',
      conditions,
      { orderBy: 'created_at', order: 'desc' },
    );

    return {
      files: files.map(f => this.parseFileJson(f)),
      total: files.length,
    };
  }

  async getFileById(projectId: string, fileId: string) {
    const file = await this.db.findOne('project_files', {
      id: fileId,
      project_id: projectId,
      deleted_at: null,
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    return this.parseFileJson(file);
  }

  async downloadProjectFile(projectId: string, fileId: string) {
    const file = await this.getFileById(projectId, fileId);

    // Download file directly from the CDN URL since the SDK download has issues
    // The fileUrl contains the CDN URL from upload result
    const axios = require('axios');
    const response = await axios.get(file.fileUrl, {
      responseType: 'arraybuffer',
    });
    const fileBuffer = Buffer.from(response.data);

    return {
      buffer: fileBuffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  async getFileUrl(projectId: string, fileId: string) {
    const file = await this.getFileById(projectId, fileId);

    // Create signed URL for temporary access using the stored key directly
    const signedUrl = await /* TODO: use StorageService */ this.db.createSignedUrlByKey(file.filePath, 3600); // 1 hour expiry

    return {
      url: signedUrl,
      expiresIn: 3600,
    };
  }

  async deleteProjectFile(projectId: string, fileId: string) {
    const file = await this.getFileById(projectId, fileId);

    // Soft delete in database
    await this.db.update('project_files', fileId, {
      deleted_at: new Date().toISOString(),
    });

    // Optionally delete from storage using the stored key directly
    try {
      await this.db.deleteByKey(file.filePath);
    } catch (error) {
      console.error('Error deleting file from storage:', error);
    }

    return { success: true, message: 'File deleted successfully' };
  }

  async shareFile(projectId: string, fileId: string, userIds: string[]) {
    await this.getFileById(projectId, fileId);

    await this.db.update('project_files', fileId, {
      shared_with: JSON.stringify(userIds),
      updated_at: new Date().toISOString(),
    });

    return this.getFileById(projectId, fileId);
  }

  async updateFileMetadata(projectId: string, fileId: string, dto: any) {
    await this.getFileById(projectId, fileId);

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.tags) updateData.tags = JSON.stringify(dto.tags);
    if (dto.isPublic !== undefined) updateData.is_public = dto.isPublic;
    if (dto.sharedWith) updateData.shared_with = JSON.stringify(dto.sharedWith);

    await this.db.update('project_files', fileId, updateData);
    return this.getFileById(projectId, fileId);
  }

  async getMilestoneFiles(projectId: string, milestoneId: string) {
    return this.getProjectFiles(projectId, { milestoneId });
  }

  async getMilestoneDeliverables(projectId: string, milestoneId: string) {
    return this.getProjectFiles(projectId, { milestoneId, isDeliverable: true });
  }

  // ============================================
  // ANALYTICS & REPORTING
  // ============================================

  async getProjectStats(projectId: string) {
    // Verify project exists and get basic info
    const project = await this.getProject(projectId);

    // Get all tasks for this project
    const tasks = await this.getProjectTasks(projectId);

    // Calculate task statistics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === TaskStatus.DONE).length;
    const inProgressTasks = tasks.filter(t => t.status === TaskStatus.INPROGRESS).length;

    // Get all milestones for this project
    const milestonesResponse = await this.getProjectMilestones(projectId);
    const milestones = milestonesResponse.milestones;

    // Calculate milestone statistics
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(
      m => m.status === MilestoneStatus.COMPLETED || m.status === MilestoneStatus.APPROVED
    ).length;

    // Calculate completion percentage based on milestones
    const completionPercentage = totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : 0;

    // Get team members count from project assignments
    const teamAssignments = await this.db.findMany(
      'project_team_assignments',
      { project_id: projectId, is_active: true }
    );
    const teamMembers = teamAssignments.length;

    // Get files count
    const projectFiles = await this.db.findMany(
      'project_files',
      { project_id: projectId, deleted_at: null }
    );
    const filesCount = projectFiles.length;

    // Calculate budget spent from milestones
    const budgetSpent = milestones.reduce((sum, m) => {
      if (m.paymentStatus === 'paid') {
        return sum + (m.amount || 0);
      }
      return sum;
    }, 0);

    // Get total budget from project
    const totalBudget = parseFloat(project.estimated_cost) || 0;

    // Return compact stats object with project data
    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        progress_percentage: project.progress_percentage,
        start_date: project.start_date,
        expected_completion_date: project.expected_completion_date,
        actual_completion_date: project.actual_completion_date,
        approval_status: project.approval_status,
        approval_reviewed_at: project.approval_reviewed_at,
        approval_rejection_reason: project.approval_rejection_reason,
      },
      stats: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        totalMilestones,
        completedMilestones,
        completionPercentage,
        teamMembers,
        filesCount,
        budgetSpent,
        totalBudget,
      },
    };
  }

  // ============================================
  // PERMISSION HELPERS
  // ============================================

  async isProjectClient(userId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    return project.client_id === userId;
  }

  async isProjectTeamMember(userId: string, projectId: string): Promise<boolean> {
    // Check project_members table first (most direct check)
    const projectMembers = await this.db.findMany('project_members', {
      project_id: projectId,
      user_id: userId,
      is_active: true,
    });

    if (projectMembers.length > 0) {
      return true;
    }

    const project = await this.getProject(projectId);

    // If project has no company_id, use old logic (backward compatibility)
    if (!project.company_id) {
      // Check if user is in assigned_team array
      if (Array.isArray(project.assigned_team)) {
        const inTeam = project.assigned_team.some((member: any) =>
          member.userId === userId || member.id === userId || member === userId
        );
        if (inTeam) return true;
      }

      // Also check project_team_assignments table
      const assignments = await this.db.findMany('project_team_assignments', {
        project_id: projectId,
        is_active: true,
      });

      return assignments.some((assignment: any) => assignment.user_id === userId);
    }

    // NEW: Check if user is a member of the project's company
    const companyMembers = await this.db.findMany('company_team_members', {
      company_id: project.company_id,
      user_id: userId,
    });

    // User must be an active member of the company to be considered a team member
    return companyMembers.length > 0 && companyMembers.some((member: any) => member.status === 'active');
  }

  async isProjectTeamLead(userId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    return project.team_lead_id === userId;
  }

  async getProjectIdFromMilestone(milestoneId: string): Promise<string> {
    const milestone = await this.getMilestoneRaw(milestoneId);
    return milestone.project_id;
  }

  /**
   * Check if user has access to a project and return their role/permissions
   * This checks the project_members table for membership
   */
  async checkProjectAccess(projectId: string, userId: string): Promise<{
    hasAccess: boolean;
    role: string | null;
    memberType: string | null;
    permissions: string[];
  }> {
    // Check project_members table for membership
    const member = await this.db.findOne('project_members', {
      project_id: projectId,
      user_id: userId,
      is_active: true,
    });

    if (member) {
      // Parse permissions if stored as JSON string
      let permissions: string[] = [];
      try {
        permissions = typeof member.permissions === 'string'
          ? JSON.parse(member.permissions)
          : (member.permissions || []);
      } catch {
        permissions = [];
      }

      return {
        hasAccess: true,
        role: member.role || 'developer',
        memberType: member.member_type || null,
        permissions,
      };
    }

    // Also check if user is the project client (owner) - fallback for older projects
    const project = await this.db.findOne('projects', { id: projectId });
    if (project && project.client_id === userId) {
      return {
        hasAccess: true,
        role: 'owner',
        memberType: 'client',
        permissions: [
          'view_project',
          'edit_project',
          'manage_proposals',
          'view_milestones',
          'approve_milestones',
          'view_messages',
          'send_messages',
          'view_files',
          'upload_files',
          'view_team',
          'manage_payments',
        ],
      };
    }

    // User has no access
    return {
      hasAccess: false,
      role: null,
      memberType: null,
      permissions: [],
    };
  }

  // ============================================
  // PROJECT COMPLETION & FEEDBACK
  // ============================================

  /**
   * End/Complete a project
   * Changes project status to 'completed' and sends notifications to all members
   */
  async endProject(projectId: string, userId: string) {
    const project = await this.getProject(projectId);

    // Check if user is authorized (client or team lead)
    const isClient = project.client_id === userId;
    const isTeamLead = project.team_lead_id === userId;
    const isTeamMember = await this.isProjectTeamMember(userId, projectId);

    if (!isClient && !isTeamLead && !isTeamMember) {
      throw new ForbiddenException('You are not authorized to end this project');
    }

    // Update project status to completed
    await this.db.update('projects', { id: projectId }, {
      status: 'completed',
      actual_completion_date: new Date().toISOString().split('T')[0], // Date only format
      updated_at: new Date().toISOString(),
    });

    // Get all project members to send notifications
    const projectMembers = await this.db.findMany('project_members', {
      project_id: projectId,
    });

    const feedbackUrl = `/company/${project.company_id}/project/${projectId}/feedback`;

    // Send notification to all members (except the one who ended the project)
    for (const member of projectMembers) {
      if (member.user_id !== userId) {
        try {
          await this.notificationsService.sendNotification({
            user_id: member.user_id,
            type: NotificationType.UPDATE,
            title: 'Project Completed',
            message: `The project "${project.name}" has been marked as completed. Please provide your feedback.`,
            priority: NotificationPriority.HIGH,
            action_url: feedbackUrl,
            data: {
              projectId,
              projectName: project.name,
              action: 'project_ended',
              feedbackUrl,
            },
          });
        } catch (err) {
          console.error(`Failed to send notification to user ${member.user_id}:`, err);
        }
      }
    }

    // Also notify the client if they didn't end it
    if (!isClient && project.client_id) {
      try {
        await this.notificationsService.sendNotification({
          user_id: project.client_id,
          type: NotificationType.UPDATE,
          title: 'Project Completed',
          message: `The project "${project.name}" has been marked as completed. Please provide your feedback.`,
          priority: NotificationPriority.HIGH,
          action_url: feedbackUrl,
          data: {
            projectId,
            projectName: project.name,
            action: 'project_ended',
            feedbackUrl,
          },
        });
      } catch (err) {
        console.error(`Failed to send notification to client:`, err);
      }
    }

    return {
      success: true,
      message: 'Project has been marked as completed',
      feedbackUrl: `/company/${project.company_id}/project/${projectId}/feedback`,
    };
  }

  /**
   * Submit feedback for a completed project
   */
  async submitProjectFeedback(
    projectId: string,
    userId: string,
    data: {
      rating: number;
      title?: string;
      content: string;
      positiveAspects?: string[];
      areasOfImprovement?: string[];
      isPublic?: boolean;
    }
  ) {
    const project = await this.getProject(projectId);

    // Verify user is part of the project
    const isClient = project.client_id === userId;
    const isTeamMember = await this.isProjectTeamMember(userId, projectId);

    if (!isClient && !isTeamMember) {
      throw new ForbiddenException('You are not authorized to submit feedback for this project');
    }

    // Check if user already submitted feedback
    const existingFeedback = await this.db.findMany('project_feedback', {
      project_id: projectId,
      client_id: userId, // Using client_id field to store reviewer_id
      feedback_type: 'project_review',
    });

    if (existingFeedback.length > 0) {
      throw new BadRequestException('You have already submitted feedback for this project');
    }

    // Validate rating
    if (data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Create feedback record
    const feedback = await this.db.insert('project_feedback', {
      project_id: projectId,
      client_id: userId, // Using this as reviewer_id
      feedback_type: 'project_review',
      rating: data.rating,
      title: data.title || null,
      content: data.content,
      positive_aspects: JSON.stringify(data.positiveAspects || []),
      areas_of_improvement: JSON.stringify(data.areasOfImprovement || []),
      is_public: data.isPublic || false,
    });

    // Determine who to notify (the other party)
    const notifyUserId = isClient ? project.team_lead_id : project.client_id;

    if (notifyUserId) {
      try {
        await this.notificationsService.sendNotification({
          user_id: notifyUserId,
          type: NotificationType.UPDATE,
          title: 'New Feedback Received',
          message: `You received feedback for the project "${project.name}"`,
          priority: NotificationPriority.NORMAL,
          data: {
            projectId,
            projectName: project.name,
            feedbackId: feedback.id,
            action: 'feedback_received',
          },
        });
      } catch (err) {
        console.error('Failed to send feedback notification:', err);
      }
    }

    return {
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: feedback.id,
        rating: feedback.rating,
        content: feedback.content,
      },
    };
  }

  /**
   * Get all feedback for a project
   */
  async getProjectFeedback(projectId: string, userId: string) {
    const project = await this.getProject(projectId);

    // Verify user is part of the project
    const isClient = project.client_id === userId;
    const isTeamMember = await this.isProjectTeamMember(userId, projectId);

    if (!isClient && !isTeamMember) {
      throw new ForbiddenException('You are not authorized to view feedback for this project');
    }

    const feedback = await this.db.findMany('project_feedback', {
      project_id: projectId,
      feedback_type: 'project_review',
    });

    // Filter out deleted feedback and transform
    const activeFeedback = feedback
      .filter((f: any) => !f.deleted_at)
      .map((f: any) => ({
        id: f.id,
        reviewerId: f.client_id,
        rating: f.rating,
        title: f.title,
        content: f.content,
        positiveAspects: this.safeJsonParse(f.positive_aspects) || [],
        areasOfImprovement: this.safeJsonParse(f.areas_of_improvement) || [],
        isPublic: f.is_public,
        createdAt: f.created_at,
      }));

    return {
      projectId,
      projectName: project.name,
      feedback: activeFeedback,
    };
  }

  /**
   * Check if user has pending feedback to submit
   */
  async getFeedbackStatus(projectId: string, userId: string) {
    const project = await this.getProject(projectId);

    // Verify user is part of the project
    const isClient = project.client_id === userId;
    const isTeamMember = await this.isProjectTeamMember(userId, projectId);

    if (!isClient && !isTeamMember) {
      throw new ForbiddenException('You are not authorized to check feedback status for this project');
    }

    // Check if project is completed
    const isCompleted = project.status === 'completed';

    // Check if user has submitted feedback
    const existingFeedback = await this.db.findMany('project_feedback', {
      project_id: projectId,
      client_id: userId,
      feedback_type: 'project_review',
    });

    const hasSubmittedFeedback = existingFeedback.length > 0;

    return {
      projectId,
      projectStatus: project.status,
      isCompleted,
      hasSubmittedFeedback,
      canSubmitFeedback: isCompleted && !hasSubmittedFeedback,
      userRole: isClient ? 'client' : 'developer',
    };
  }

  /**
   * Fix project status to 'awarded' if proposal is accepted but status is still 'planning'
   */
  async fixAwardedStatus(projectId: string) {
    // Get the project
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if project has an accepted proposal
    const acceptedProposal = await this.db.findOne('project_proposals', {
      project_id: projectId,
      status: 'accepted',
    });

    if (!acceptedProposal) {
      return {
        message: 'No accepted proposal found for this project',
        updated: false,
      };
    }

    // If status is 'planning', update it to 'awarded'
    if (project.status === 'planning') {
      await this.db.update('projects', projectId, {
        status: 'awarded',
        awarded_at: acceptedProposal.reviewed_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return {
        message: 'Project status updated from planning to awarded',
        updated: true,
        previousStatus: 'planning',
        newStatus: 'awarded',
      };
    }

    return {
      message: `Project status is already ${project.status}`,
      updated: false,
      currentStatus: project.status,
    };
  }

  /**
   * Send milestone plan reminder notification from client to developer
   */
  async sendMilestonePlanReminder(projectId: string, clientId: string) {
    // Get the project
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify the user is the project client
    if (project.client_id !== clientId) {
      throw new ForbiddenException('Only the project client can send this reminder');
    }

    // Get the accepted proposal to find the developer
    const acceptedProposal = await this.db.findOne('project_proposals', {
      project_id: projectId,
      status: 'accepted',
    });

    if (!acceptedProposal) {
      throw new NotFoundException('No accepted proposal found for this project');
    }

    const developerId = acceptedProposal.submitted_by;

    // Create notification for the developer
    await this.db.insert('notifications', {
      user_id: developerId,
      notification_type: 'milestone_plan_reminder',
      title: 'Milestone Plan Request',
      message: `Client is requesting milestone plan for project "${project.name}"`,
      action_url: `/company/${acceptedProposal.company_id}/project/${projectId}/milestone-planning`,
      action_data: {
        project_id: projectId,
        project_name: project.name,
        requested_by: clientId,
        requested_at: new Date().toISOString(),
      },
      priority: 'high',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Emit WebSocket event to notify developer in real-time
    this.gateway.server.to(`user:${developerId}`).emit('milestone_plan:reminder', {
      projectId,
      projectName: project.name,
      message: 'Client is requesting milestone plan submission',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Reminder sent to developer',
      sentTo: developerId,
    };
  }

  /**
   * Get milestone plan request status
   * Returns whether client has sent request and if developer has unread notifications
   */
  async getMilestonePlanRequestStatus(projectId: string, userId: string) {
    // Get the project
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check user role
    const isClient = project.client_id === userId;
    const isDeveloper = !isClient;

    // Get the accepted proposal to find developer
    const acceptedProposal = await this.db.findOne('project_proposals', {
      project_id: projectId,
      status: 'accepted',
    });

    if (!acceptedProposal) {
      return {
        hasRequested: false,
        requestCount: 0,
        lastRequestedAt: null,
        unreadCount: 0,
      };
    }

    const developerId = acceptedProposal.submitted_by;

    // Find all milestone plan reminder notifications for this project
    const notifications = await this.db.findMany('notifications', {
      user_id: developerId,
      notification_type: 'milestone_plan_reminder',
    });

    // Filter notifications for this specific project
    const projectNotifications = notifications.filter(
      (n: any) => n.action_data?.project_id === projectId
    );

    const hasRequested = projectNotifications.length > 0;
    const requestCount = projectNotifications.length;
    const unreadCount = projectNotifications.filter((n: any) => !n.is_read).length;

    const lastNotification = projectNotifications.sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    const lastRequestedAt = lastNotification ? lastNotification.created_at : null;

    return {
      hasRequested,
      requestCount,
      lastRequestedAt,
      unreadCount,
      isClient,
      isDeveloper,
    };
  }

  /**
   * Dismiss (mark as read) milestone plan request notifications for a project
   */
  async dismissMilestonePlanRequests(projectId: string, userId: string) {
    // Get the project
    const project = await this.db.findOne('projects', { id: projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Find all milestone plan reminder notifications for this user
    const notifications = await this.db.findMany('notifications', {
      user_id: userId,
      notification_type: 'milestone_plan_reminder',
      is_read: false,
    });

    // Filter notifications for this specific project
    const projectNotifications = notifications.filter(
      (n: any) => n.action_data?.project_id === projectId
    );

    // Mark all as read
    const updatePromises = projectNotifications.map((notification: any) =>
      this.db.update('notifications', notification.id, {
        is_read: true,
        read_at: new Date().toISOString(),
      })
    );

    await Promise.all(updatePromises);

    return {
      success: true,
      message: 'Notifications marked as read',
      count: projectNotifications.length,
    };
  }
}
