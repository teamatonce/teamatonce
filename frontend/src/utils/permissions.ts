/**
 * Permission Utility Functions
 *
 * Centralized permission checks for Team@Once application
 */

import { Project } from '@/types/project';
import { CompanyMember, MemberRole } from '@/types/company';
import { User } from '@/lib/api';

/**
 * Check if user can assign team members to a project
 *
 * PERMISSIONS:
 * - Client who owns the project can assign developer companies
 * - Developer company owner/admin can assign their team members to projects assigned to their company
 * - Regular team members cannot assign
 *
 * @param project - The project to check permissions for
 * @param user - The current authenticated user
 * @param companyMember - The user's company membership (if any)
 * @returns true if user can assign team, false otherwise
 */
export const canAssignTeam = (
  project: Project,
  user: User | null,
  companyMember: CompanyMember | null
): boolean => {
  // No user logged in
  if (!user) return false;

  // Client owns the project - can assign developer companies
  if (project.client_id === user.id) {
    return true;
  }

  // Developer company owner/admin - can assign their team members
  if (companyMember && (companyMember.role === MemberRole.OWNER || companyMember.role === MemberRole.ADMIN)) {
    // Check if project is assigned to this company
    return project.company_id === companyMember.company_id;
  }

  // Regular team members cannot assign
  return false;
};

/**
 * Get the appropriate tooltip/label for the assign team button
 * based on user's role
 *
 * @param project - The project
 * @param user - The current user
 * @param companyMember - The user's company membership
 * @returns Appropriate label for the assign button
 */
export const getAssignTeamLabel = (
  project: Project,
  user: User | null,
  companyMember: CompanyMember | null
): string => {
  if (!user) return 'Assign Team';

  // Client owns the project
  if (project.client_id === user.id) {
    return 'Assign Developer Company';
  }

  // Developer company owner/admin
  if (companyMember && (companyMember.role === MemberRole.OWNER || companyMember.role === MemberRole.ADMIN)) {
    return 'Assign Team Members';
  }

  return 'Assign Team';
};

/**
 * Get the appropriate modal title based on user role
 *
 * @param project - The project
 * @param user - The current user
 * @param companyMember - The user's company membership
 * @returns Appropriate modal title
 */
export const getAssignModalTitle = (
  project: Project,
  user: User | null,
  companyMember: CompanyMember | null
): string => {
  if (!user) return 'Assign Team';

  // Client owns the project
  if (project.client_id === user.id) {
    return 'Assign Developer Company';
  }

  // Developer company owner/admin
  if (companyMember && (companyMember.role === MemberRole.OWNER || companyMember.role === MemberRole.ADMIN)) {
    return 'Assign Team Members';
  }

  return 'Assign Team';
};

/**
 * Check if user is a client for a project
 */
export const isProjectClient = (project: Project, user: User | null): boolean => {
  return user !== null && project.client_id === user.id;
};

/**
 * Check if user is a developer company owner/admin
 */
export const isDeveloperCompanyAdmin = (companyMember: CompanyMember | null): boolean => {
  return companyMember !== null &&
         (companyMember.role === MemberRole.OWNER || companyMember.role === MemberRole.ADMIN);
};

/**
 * Check if user is a regular team member (not owner/admin)
 */
export const isRegularTeamMember = (companyMember: CompanyMember | null): boolean => {
  return companyMember !== null && companyMember.role === MemberRole.MEMBER;
};
