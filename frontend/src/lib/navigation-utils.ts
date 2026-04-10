/**
 * Navigation utilities for handling company-based routing
 * Pattern adapted from database for Team@Once
 */

export type SectionType = 'client' | 'developer' | 'settings' | 'project';

interface BuildPathOptions {
  companyId: string;
  section: SectionType;
  subPath?: string;
}

/**
 * Builds a dynamic path that supports company-based navigation
 * @param options - The options for building the path
 * @returns The constructed path string
 *
 * @example
 * // Client dashboard
 * buildSectionPath({
 *   companyId: '123',
 *   section: 'client',
 *   subPath: 'dashboard'
 * })
 * // Returns: /company/123/client/dashboard
 */
export function buildSectionPath(options: BuildPathOptions): string {
  const { companyId, section, subPath } = options;

  // Build base path
  const basePath = `/company/${companyId}/${section}`;

  // Append subPath if provided
  if (subPath) {
    // Remove leading slash if present to avoid double slashes
    const cleanSubPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    return `${basePath}/${cleanSubPath}`;
  }

  return basePath;
}

/**
 * Extracts context (companyId, projectId) from React Router params
 * @param params - The params object from useParams()
 * @returns Object containing companyId and optional projectId
 */
export function extractRouteContext(params: Record<string, string | undefined>) {
  return {
    companyId: params.companyId || '',
    projectId: params.projectId
  };
}

/**
 * Helper function to build common section paths
 */
export const sectionPaths = {
  client: (context: { companyId: string }, subPath?: string) =>
    buildSectionPath({ ...context, section: 'client', subPath }),

  developer: (context: { companyId: string }, subPath?: string) =>
    buildSectionPath({ ...context, section: 'developer', subPath }),

  settings: (context: { companyId: string }, subPath?: string) =>
    buildSectionPath({ ...context, section: 'settings', subPath }),

  project: (context: { companyId: string; projectId?: string }, subPath?: string) => {
    if (!context.projectId) {
      throw new Error('projectId is required for project paths');
    }
    return `/company/${context.companyId}/project/${context.projectId}${subPath ? `/${subPath.startsWith('/') ? subPath.slice(1) : subPath}` : ''}`;
  },
};

/**
 * Check if current route is at project level
 */
export function isProjectLevel(params: Record<string, string | undefined>): boolean {
  return !!params.projectId;
}

/**
 * Get the current section from URL
 */
export function getCurrentSection(pathname: string): SectionType | null {
  if (pathname.includes('/client/')) return 'client';
  if (pathname.includes('/developer/')) return 'developer';
  if (pathname.includes('/settings/')) return 'settings';
  if (pathname.includes('/project/')) return 'project';
  return null;
}
