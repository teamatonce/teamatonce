import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import {
  FileText,
  Target,
  Users,
  Code,
  Layers,
  Globe,
  Zap,
  CheckCircle,
  Edit3,
  Plus,
  Calendar,
  DollarSign,
  AlertCircle,
  Settings,
  Database,
  Cloud,
  Smartphone,
  Monitor,
  Package,
  Clock,
  Loader2,
  X,
} from 'lucide-react';
import { ProjectPageLayout } from '@/layouts/ProjectPageLayout';
import { AccessDenied, AccessLoading } from '@/components/project';
import { getProject } from '@/services/projectService';
import {
  addRequirement,
  getProjectRequirements,
  RequirementType,
  RequirementPriority,
  Requirement as ApiRequirement,
} from '@/services/projectDefinitionService';
import { useProjectRole } from '@/hooks/useProjectRole';
import { Project } from '@/types/project';
import { toast } from 'sonner';

/**
 * Project Definition Page
 * Comprehensive project requirements, scope, specifications, and technical details
 */

interface Requirement {
  id: string;
  category: 'functional' | 'technical' | 'business' | 'design';
  title: string;
  description: string;
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  status: 'approved' | 'pending' | 'revision';
}

interface TechStack {
  frontend: string[];
  backend: string[];
  database: string[];
  infrastructure: string[];
  tools: string[];
}

interface Scope {
  included: string[];
  excluded: string[];
}

export const ProjectDefinition: React.FC = () => {
  const { projectId } = useParams();

  // Check project membership
  const { hasAccess, loading: roleLoading } = useProjectRole(projectId);

  const [activeTab, setActiveTab] = useState<'requirements' | 'scope' | 'tech' | 'specs'>('requirements');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Data state
  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [techStack, setTechStack] = useState<TechStack>({
    frontend: [],
    backend: [],
    database: [],
    infrastructure: [],
    tools: [],
  });
  const [scope, setScope] = useState<Scope>({
    included: [],
    excluded: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingRequirement, setAddingRequirement] = useState(false);
  const [newRequirement, setNewRequirement] = useState({
    title: '',
    description: '',
    type: 'functional' as RequirementType,
    priority: 'medium' as RequirementPriority,
  });

  // Parse requirements from project data
  const parseRequirements = useCallback((projectData: Project): Requirement[] => {
    const reqs: Requirement[] = [];

    // Parse from project.requirements if it's an object with items
    if (projectData.requirements) {
      if (Array.isArray(projectData.requirements)) {
        // Already an array of requirements
        return projectData.requirements.map((r: any, idx: number) => ({
          id: r.id || `req-${idx}`,
          category: r.category || 'functional',
          title: r.title || r.name || 'Requirement',
          description: r.description || '',
          priority: r.priority || 'should-have',
          status: r.status || 'pending',
        }));
      } else if (typeof projectData.requirements === 'object') {
        // Object with categories
        Object.entries(projectData.requirements).forEach(([category, items]) => {
          if (Array.isArray(items)) {
            items.forEach((item: any, idx: number) => {
              reqs.push({
                id: `${category}-${idx}`,
                category: (category as any) || 'functional',
                title: typeof item === 'string' ? item : item.title || item.name,
                description: typeof item === 'string' ? '' : item.description || '',
                priority: item.priority || 'should-have',
                status: item.status || 'pending',
              });
            });
          }
        });
      }
    }

    // Also parse from features as functional requirements
    if (projectData.features && Array.isArray(projectData.features)) {
      projectData.features.forEach((feature: string, idx: number) => {
        reqs.push({
          id: `feature-${idx}`,
          category: 'functional',
          title: feature,
          description: '',
          priority: 'should-have',
          status: 'approved',
        });
      });
    }

    return reqs;
  }, []);

  // Parse tech stack from project data
  const parseTechStack = useCallback((projectData: Project): TechStack => {
    const stack: TechStack = {
      frontend: [],
      backend: [],
      database: [],
      infrastructure: [],
      tools: [],
    };

    // Add tech_stack items
    if (projectData.tech_stack && Array.isArray(projectData.tech_stack)) {
      // Try to categorize based on keywords
      projectData.tech_stack.forEach((tech: string) => {
        const lowerTech = tech.toLowerCase();
        if (['react', 'vue', 'angular', 'next', 'nuxt', 'svelte', 'tailwind', 'css', 'html', 'javascript', 'typescript'].some(k => lowerTech.includes(k))) {
          stack.frontend.push(tech);
        } else if (['node', 'express', 'nestjs', 'django', 'flask', 'rails', 'spring', 'laravel', 'php', 'python', 'java', 'go', 'rust'].some(k => lowerTech.includes(k))) {
          stack.backend.push(tech);
        } else if (['postgres', 'mysql', 'mongo', 'redis', 'sqlite', 'sql', 'firebase', 'prisma'].some(k => lowerTech.includes(k))) {
          stack.database.push(tech);
        } else if (['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'vercel', 'netlify', 'heroku', 'nginx'].some(k => lowerTech.includes(k))) {
          stack.infrastructure.push(tech);
        } else {
          stack.tools.push(tech);
        }
      });
    }

    // Add frameworks
    if (projectData.frameworks && Array.isArray(projectData.frameworks)) {
      projectData.frameworks.forEach((fw: string) => {
        if (!stack.frontend.includes(fw) && !stack.backend.includes(fw)) {
          stack.backend.push(fw);
        }
      });
    }

    return stack;
  }, []);

  // Parse scope from project metadata
  const parseScope = useCallback((projectData: Project): Scope => {
    const scopeData: Scope = {
      included: [],
      excluded: [],
    };

    // Try to get from metadata
    if (projectData.metadata?.scope) {
      scopeData.included = projectData.metadata.scope.included || [];
      scopeData.excluded = projectData.metadata.scope.excluded || [];
    }

    // If no scope in metadata, derive from features
    if (scopeData.included.length === 0 && projectData.features) {
      scopeData.included = projectData.features;
    }

    return scopeData;
  }, []);

  // Map API priority to local priority format
  const mapPriorityFromApi = useCallback((priority: RequirementPriority): Requirement['priority'] => {
    switch (priority) {
      case 'critical':
      case 'high':
        return 'must-have';
      case 'medium':
        return 'should-have';
      case 'low':
        return 'nice-to-have';
      default:
        return 'should-have';
    }
  }, []);

  // Load project data
  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch project data and requirements from API in parallel
      const [projectData, apiRequirements] = await Promise.all([
        getProject(projectId),
        getProjectRequirements(projectId).catch(() => []), // Don't fail if no requirements yet
      ]);

      setProject(projectData);

      // Parse requirements from project data (legacy)
      const parsedReqs = parseRequirements(projectData);

      // Map API requirements to local format
      const mappedApiReqs: Requirement[] = apiRequirements.map((req: any) => ({
        id: req.id,
        category: req.type === 'non-functional' ? 'technical' : (req.type as Requirement['category']),
        title: req.title,
        description: req.description || '',
        priority: mapPriorityFromApi(req.priority),
        status: 'pending' as const,
      }));

      // Merge parsed requirements with API requirements (avoid duplicates by id)
      const existingIds = new Set(mappedApiReqs.map(r => r.id));
      const mergedReqs = [
        ...mappedApiReqs,
        ...parsedReqs.filter(r => !existingIds.has(r.id)),
      ];

      setRequirements(mergedReqs);

      // Parse tech stack
      const stack = parseTechStack(projectData);
      setTechStack(stack);

      // Parse scope
      const scopeData = parseScope(projectData);
      setScope(scopeData);
    } catch (err: any) {
      console.error('Error loading project definition:', err);
      setError('Failed to load project definition. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, parseRequirements, parseTechStack, parseScope, mapPriorityFromApi]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle adding a new requirement
  const handleAddRequirement = async () => {
    if (!projectId) return;

    // Validation
    if (!newRequirement.title.trim()) {
      toast.error('Please enter a requirement title');
      return;
    }
    if (!newRequirement.description.trim()) {
      toast.error('Please enter a requirement description');
      return;
    }

    setAddingRequirement(true);
    try {
      const created = await addRequirement(projectId, {
        title: newRequirement.title.trim(),
        description: newRequirement.description.trim(),
        type: newRequirement.type,
        priority: newRequirement.priority,
      });

      // Map the API response to our local Requirement format
      const mappedReq: Requirement = {
        id: created.id,
        category: newRequirement.type === 'non-functional' ? 'technical' : newRequirement.type as any,
        title: created.title,
        description: created.description,
        priority: mapPriorityFromApi(created.priority),
        status: 'pending',
      };

      // Add to local state
      setRequirements(prev => [...prev, mappedReq]);

      // Reset form and close modal
      setNewRequirement({
        title: '',
        description: '',
        type: 'functional',
        priority: 'medium',
      });
      setShowAddModal(false);
      toast.success('Requirement added successfully');
    } catch (err: any) {
      console.error('Error adding requirement:', err);
      toast.error(err.message || 'Failed to add requirement');
    } finally {
      setAddingRequirement(false);
    }
  };

  const getCategoryIcon = (category: Requirement['category']) => {
    switch (category) {
      case 'functional':
        return Target;
      case 'technical':
        return Code;
      case 'business':
        return DollarSign;
      case 'design':
        return Layers;
      default:
        return FileText;
    }
  };

  const getCategoryColor = (category: Requirement['category']) => {
    switch (category) {
      case 'functional':
        return 'blue';
      case 'technical':
        return 'purple';
      case 'business':
        return 'green';
      case 'design':
        return 'pink';
      default:
        return 'gray';
    }
  };

  const getPriorityColor = (priority: Requirement['priority']) => {
    switch (priority) {
      case 'must-have':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'should-have':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'nice-to-have':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = (status: Requirement['status']) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'revision':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const filteredRequirements =
    selectedCategory === 'all'
      ? requirements
      : requirements.filter((r) => r.category === selectedCategory);

  const requirementStats = {
    total: requirements.length,
    approved: requirements.filter((r) => r.status === 'approved').length,
    pending: requirements.filter((r) => r.status === 'pending').length,
    revision: requirements.filter((r) => r.status === 'revision').length,
  };

  // Project specs from loaded data
  const projectSpecs = project ? {
    estimatedDuration: project.estimated_duration_days
      ? `${Math.ceil(project.estimated_duration_days / 30)} months`
      : 'Not specified',
    estimatedBudget: project.estimated_cost
      ? `$${project.estimated_cost.toLocaleString()}`
      : 'Not specified',
    teamSize: project.assigned_team?.length || 0,
    startDate: project.start_date ? new Date(project.start_date) : null,
    targetLaunchDate: project.expected_completion_date ? new Date(project.expected_completion_date) : null,
    platforms: project.metadata?.platforms || ['Web'],
    languages: project.metadata?.languages || ['English'],
    targetAudience: project.metadata?.targetAudience || project.project_type || 'Not specified',
  } : null;

  // Access check
  if (roleLoading) {
    return <AccessLoading />;
  }

  if (!hasAccess) {
    return <AccessDenied message="You don't have permission to access project definition for this project." />;
  }

  // Loading state
  if (loading) {
    return (
      <ProjectPageLayout
        title="Project Definition"
        subtitle="Loading..."
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading project definition...</p>
          </div>
        </div>
      </ProjectPageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <ProjectPageLayout
        title="Project Definition"
        subtitle="Error"
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-800 font-semibold mb-2">Error Loading Data</p>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={loadData}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </ProjectPageLayout>
    );
  }

  return (
    <ProjectPageLayout
      title="Project Definition"
      subtitle="Comprehensive project requirements and specifications"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          {
            label: 'Total Requirements',
            value: requirementStats.total,
            icon: FileText,
            color: 'blue',
          },
          {
            label: 'Approved',
            value: requirementStats.approved,
            icon: CheckCircle,
            color: 'green',
          },
          {
            label: 'Pending Review',
            value: requirementStats.pending,
            icon: AlertCircle,
            color: 'yellow',
          },
          {
            label: 'Needs Revision',
            value: requirementStats.revision,
            icon: Edit3,
            color: 'orange',
          },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-600 mb-1">{stat.label}</p>
                <p className="text-3xl font-black text-gray-900">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl bg-${stat.color}-100 flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="flex items-center border-b border-gray-200 bg-gray-50">
          {[
            { id: 'requirements', label: 'Requirements', icon: FileText },
            { id: 'scope', label: 'Project Scope', icon: Target },
            { id: 'tech', label: 'Tech Stack', icon: Code },
            { id: 'specs', label: 'Specifications', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-6 py-4 font-semibold transition-all flex items-center justify-center space-x-2 ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 border-b-4 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Requirements Tab */}
          {activeTab === 'requirements' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'functional', label: 'Functional' },
                    { id: 'technical', label: 'Technical' },
                    { id: 'business', label: 'Business' },
                    { id: 'design', label: 'Design' },
                  ].map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                        selectedCategory === category.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Requirement</span>
                </motion.button>
              </div>

              {/* Requirements List */}
              {filteredRequirements.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold mb-2">No requirements found</h3>
                  <p className="text-sm">Add requirements to define your project scope</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequirements.map((req, idx) => {
                    const Icon = getCategoryIcon(req.category);
                    const categoryColor = getCategoryColor(req.category);

                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-all"
                      >
                        <div className="flex items-start space-x-4">
                          <div className={`w-12 h-12 rounded-lg bg-${categoryColor}-100 flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-6 h-6 text-${categoryColor}-600`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-bold text-gray-900">{req.title}</h3>
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-bold border ${getPriorityColor(
                                    req.priority
                                  )}`}
                                >
                                  {req.priority.replace('-', ' ').toUpperCase()}
                                </span>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-bold border ${getStatusColor(
                                    req.status
                                  )}`}
                                >
                                  {req.status.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {req.description && (
                              <p className="text-sm text-gray-700 mb-3">{req.description}</p>
                            )}

                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 bg-${categoryColor}-50 text-${categoryColor}-700 rounded-full text-xs font-semibold capitalize`}>
                                {req.category}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Scope Tab */}
          {activeTab === 'scope' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* In Scope */}
                <div>
                  <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center space-x-2">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <span>In Scope</span>
                  </h3>
                  {scope.included.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No scope items defined yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scope.included.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 flex items-start space-x-3"
                        >
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700">{item}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Out of Scope */}
                <div>
                  <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center space-x-2">
                    <X className="w-6 h-6 text-red-600" />
                    <span>Out of Scope</span>
                  </h3>
                  {scope.excluded.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No exclusions defined yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scope.excluded.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="p-3 bg-gradient-to-br from-red-50 to-pink-50 rounded-xl border-2 border-red-200 flex items-start space-x-3"
                        >
                          <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700">{item}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tech Stack Tab */}
          {activeTab === 'tech' && (
            <div className="space-y-6">
              {[
                { title: 'Frontend', icon: Monitor, color: 'blue', items: techStack.frontend },
                { title: 'Backend', icon: Code, color: 'purple', items: techStack.backend },
                { title: 'Database', icon: Database, color: 'green', items: techStack.database },
                { title: 'Infrastructure', icon: Cloud, color: 'orange', items: techStack.infrastructure },
                { title: 'Tools', icon: Package, color: 'pink', items: techStack.tools },
              ].filter(section => section.items.length > 0).map((section, sIdx) => {
                const Icon = section.icon;
                return (
                  <div key={sIdx}>
                    <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-lg bg-${section.color}-100 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 text-${section.color}-600`} />
                      </div>
                      <span>{section.title}</span>
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {section.items.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`px-4 py-2 bg-${section.color}-50 border-2 border-${section.color}-200 text-${section.color}-700 rounded-xl font-semibold`}
                        >
                          {item}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {Object.values(techStack).every(arr => arr.length === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <Code className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold mb-2">No tech stack defined</h3>
                  <p className="text-sm">Add technologies to your project</p>
                </div>
              )}
            </div>
          )}

          {/* Specifications Tab */}
          {activeTab === 'specs' && projectSpecs && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    label: 'Estimated Duration',
                    value: projectSpecs.estimatedDuration,
                    icon: Clock,
                    color: 'blue',
                  },
                  {
                    label: 'Estimated Budget',
                    value: projectSpecs.estimatedBudget,
                    icon: DollarSign,
                    color: 'green',
                  },
                  {
                    label: 'Team Size',
                    value: `${projectSpecs.teamSize} members`,
                    icon: Users,
                    color: 'purple',
                  },
                  {
                    label: 'Start Date',
                    value: projectSpecs.startDate?.toLocaleDateString() || 'Not set',
                    icon: Calendar,
                    color: 'orange',
                  },
                  {
                    label: 'Target Launch',
                    value: projectSpecs.targetLaunchDate?.toLocaleDateString() || 'Not set',
                    icon: Zap,
                    color: 'pink',
                  },
                  {
                    label: 'Project Type',
                    value: projectSpecs.targetAudience,
                    icon: Target,
                    color: 'red',
                  },
                ].map((spec, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-6 bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200"
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg bg-${spec.color}-100 flex items-center justify-center`}>
                        <spec.icon className={`w-5 h-5 text-${spec.color}-600`} />
                      </div>
                      <h3 className="font-bold text-gray-600">{spec.label}</h3>
                    </div>
                    <p className="text-2xl font-black text-gray-900">{spec.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Additional Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
                  <h3 className="font-black text-gray-900 mb-4 flex items-center space-x-2">
                    <Smartphone className="w-5 h-5 text-blue-600" />
                    <span>Platforms</span>
                  </h3>
                  <div className="space-y-2">
                    {projectSpecs.platforms.map((platform: string, idx: number) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-700">{platform}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
                  <h3 className="font-black text-gray-900 mb-4 flex items-center space-x-2">
                    <Globe className="w-5 h-5 text-green-600" />
                    <span>Languages</span>
                  </h3>
                  <div className="space-y-2">
                    {projectSpecs.languages.map((lang: string, idx: number) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-gray-700">{lang}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Requirement Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-black text-gray-900">Add New Requirement</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRequirement.title}
                    onChange={(e) => setNewRequirement(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter requirement title"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newRequirement.description}
                    onChange={(e) => setNewRequirement(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the requirement in detail"
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Type and Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Type
                    </label>
                    <select
                      value={newRequirement.type}
                      onChange={(e) => setNewRequirement(prev => ({ ...prev, type: e.target.value as RequirementType }))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white"
                    >
                      <option value="functional">Functional</option>
                      <option value="non-functional">Non-Functional</option>
                      <option value="technical">Technical</option>
                      <option value="business">Business</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={newRequirement.priority}
                      onChange={(e) => setNewRequirement(prev => ({ ...prev, priority: e.target.value as RequirementPriority }))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors bg-white"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={addingRequirement}
                  className="px-6 py-2.5 text-gray-700 font-semibold hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAddRequirement}
                  disabled={addingRequirement}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center space-x-2"
                >
                  {addingRequirement ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      <span>Add Requirement</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ProjectPageLayout>
  );
};

export default ProjectDefinition;
