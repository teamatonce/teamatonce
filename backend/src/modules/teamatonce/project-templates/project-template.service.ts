import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreateProjectTemplateDto,
  TemplateCategory,
  UseTemplateDto,
} from './dto/project-template.dto';

@Injectable()
export class ProjectTemplateService implements OnModuleInit {
  private readonly logger = new Logger(ProjectTemplateService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.ensureTable();
    await this.seedDefaults();
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async createTemplate(userId: string, dto: CreateProjectTemplateDto) {
    const template = await this.db.insert('project_templates', {
      name: dto.name,
      description: dto.description || null,
      category: dto.category,
      milestones: JSON.stringify(dto.milestones || []),
      suggested_budget_range: dto.suggestedBudgetRange
        ? JSON.stringify(dto.suggestedBudgetRange)
        : null,
      tech_stack: dto.techStack ? JSON.stringify(dto.techStack) : null,
      is_platform: false,
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return this.transform(template);
  }

  async listTemplates(filters?: { category?: string; search?: string }) {
    let sql = 'SELECT * FROM project_templates WHERE 1=1';
    const params: any[] = [];

    if (filters?.category) {
      params.push(filters.category);
      sql += ` AND category = $${params.length}`;
    }
    if (filters?.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ' ORDER BY is_platform DESC, name ASC';

    const result = await this.db.query(sql, params);
    return result.rows.map((r: any) => this.transform(r));
  }

  async getTemplate(id: string) {
    const template = await this.db.findOne('project_templates', { id });
    if (!template) throw new NotFoundException('Template not found');
    return this.transform(template);
  }

  async createProjectFromTemplate(
    userId: string,
    templateId: string,
    dto: UseTemplateDto,
  ) {
    const template = await this.db.findOne('project_templates', {
      id: templateId,
    });
    if (!template) throw new NotFoundException('Template not found');

    const milestones = this.parseJson(template.milestones, []);
    const budgetRange = this.parseJson(template.suggested_budget_range, null);

    // Create the project
    const project = await this.db.insert('projects', {
      name: dto.projectName,
      description: dto.description || template.description || null,
      project_type: template.category,
      template_id: templateId,
      client_id: userId,
      status: 'planning',
      budget_min: budgetRange?.min || null,
      budget_max: budgetRange?.max || null,
      currency: budgetRange?.currency || 'USD',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Clone milestones into the project
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      await this.db.insert('milestones', {
        project_id: project.id,
        name: m.name,
        description: m.description || null,
        deliverables: JSON.stringify(m.deliverables || []),
        estimated_days: m.estimatedDays || null,
        order_index: i,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        templateId: project.template_id,
      },
      milestonesCreated: milestones.length,
    };
  }

  // ------------------------------------------------------------------
  // Schema + Seed
  // ------------------------------------------------------------------

  private async ensureTable() {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS project_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) NOT NULL,
          milestones JSONB DEFAULT '[]',
          suggested_budget_range JSONB,
          tech_stack JSONB,
          is_platform BOOLEAN DEFAULT false,
          created_by UUID,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_project_templates_category
          ON project_templates(category);
      `);
    } catch (err) {
      this.logger.warn('project_templates table may already exist', err.message);
    }
  }

  private async seedDefaults() {
    const existing = await this.db.query(
      "SELECT id FROM project_templates WHERE is_platform = true LIMIT 1",
    );
    if (existing.rows.length > 0) return; // already seeded

    const seeds: Array<{
      name: string;
      description: string;
      category: TemplateCategory;
      milestones: any[];
      suggestedBudgetRange: { min: number; max: number; currency: string };
      techStack: string[];
    }> = [
      {
        name: 'Web Application',
        description:
          'Full-stack web application with authentication, dashboard, and core features.',
        category: TemplateCategory.WEB_APP,
        milestones: [
          { name: 'Discovery & Planning', description: 'Requirements gathering, wireframes, architecture design', deliverables: ['PRD document', 'Wireframes', 'Architecture diagram'], estimatedDays: 7 },
          { name: 'UI/UX Design', description: 'Visual design, component library, responsive layouts', deliverables: ['Design system', 'Page mockups', 'Prototype'], estimatedDays: 10 },
          { name: 'Backend Development', description: 'API development, database schema, authentication', deliverables: ['REST API', 'Database migrations', 'Auth system'], estimatedDays: 14 },
          { name: 'Frontend Development', description: 'Component development, state management, integration', deliverables: ['Pages & components', 'API integration', 'Responsive UI'], estimatedDays: 14 },
          { name: 'Testing & Launch', description: 'QA testing, bug fixes, deployment', deliverables: ['Test report', 'Deployed application', 'Documentation'], estimatedDays: 7 },
        ],
        suggestedBudgetRange: { min: 5000, max: 25000, currency: 'USD' },
        techStack: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
      },
      {
        name: 'Mobile Application',
        description:
          'Cross-platform mobile app with native feel for iOS and Android.',
        category: TemplateCategory.MOBILE_APP,
        milestones: [
          { name: 'Discovery & Planning', description: 'App requirements, user flows, platform considerations', deliverables: ['App spec', 'User flow diagrams', 'Platform matrix'], estimatedDays: 7 },
          { name: 'UI/UX Design', description: 'Mobile UI design, navigation patterns, animations', deliverables: ['App screens', 'Navigation flow', 'Animation specs'], estimatedDays: 10 },
          { name: 'Core Development', description: 'Navigation, authentication, core screens', deliverables: ['Auth flow', 'Core screens', 'State management'], estimatedDays: 21 },
          { name: 'API Integration & Polish', description: 'Backend integration, offline support, push notifications', deliverables: ['API integration', 'Push notifications', 'Offline mode'], estimatedDays: 14 },
          { name: 'Testing & Store Submission', description: 'Device testing, store assets, submission', deliverables: ['Test results', 'Store listings', 'Submitted app'], estimatedDays: 7 },
        ],
        suggestedBudgetRange: { min: 8000, max: 40000, currency: 'USD' },
        techStack: ['React Native', 'TypeScript', 'Expo'],
      },
      {
        name: 'API Development',
        description:
          'RESTful or GraphQL API with documentation, auth, and monitoring.',
        category: TemplateCategory.API,
        milestones: [
          { name: 'API Design', description: 'Endpoint design, schema definition, auth strategy', deliverables: ['OpenAPI spec', 'Database schema', 'Auth design'], estimatedDays: 5 },
          { name: 'Core Implementation', description: 'Endpoint development, business logic, validation', deliverables: ['API endpoints', 'Validation layer', 'Error handling'], estimatedDays: 14 },
          { name: 'Auth & Security', description: 'Authentication, rate limiting, input sanitization', deliverables: ['Auth system', 'Rate limiter', 'Security audit'], estimatedDays: 7 },
          { name: 'Testing & Documentation', description: 'Unit/integration tests, API docs, deployment', deliverables: ['Test suite', 'API documentation', 'CI/CD pipeline'], estimatedDays: 7 },
        ],
        suggestedBudgetRange: { min: 3000, max: 15000, currency: 'USD' },
        techStack: ['Node.js', 'NestJS', 'PostgreSQL', 'Swagger'],
      },
      {
        name: 'UI/UX Design',
        description:
          'Complete design system with user research, wireframes, and high-fidelity mockups.',
        category: TemplateCategory.DESIGN,
        milestones: [
          { name: 'Research & Discovery', description: 'User research, competitive analysis, persona development', deliverables: ['Research report', 'User personas', 'Competitive analysis'], estimatedDays: 7 },
          { name: 'Information Architecture', description: 'Site map, user flows, content strategy', deliverables: ['Site map', 'User flows', 'Content outline'], estimatedDays: 5 },
          { name: 'Wireframes & Prototypes', description: 'Low-fi wireframes, interactive prototypes', deliverables: ['Wireframes', 'Clickable prototype', 'Usability test plan'], estimatedDays: 10 },
          { name: 'Visual Design', description: 'High-fidelity designs, design system, handoff', deliverables: ['Design system', 'All page designs', 'Developer handoff'], estimatedDays: 10 },
        ],
        suggestedBudgetRange: { min: 3000, max: 15000, currency: 'USD' },
        techStack: ['Figma', 'Adobe XD'],
      },
      {
        name: 'DevOps Setup',
        description:
          'CI/CD pipeline, infrastructure as code, monitoring, and security hardening.',
        category: TemplateCategory.DEVOPS,
        milestones: [
          { name: 'Infrastructure Audit', description: 'Current state assessment, requirements gathering', deliverables: ['Audit report', 'Recommendations', 'Architecture plan'], estimatedDays: 5 },
          { name: 'CI/CD Pipeline', description: 'Build, test, and deploy automation', deliverables: ['CI/CD config', 'Automated tests', 'Deploy scripts'], estimatedDays: 7 },
          { name: 'Infrastructure as Code', description: 'Terraform/Pulumi configs, environment setup', deliverables: ['IaC templates', 'Environment configs', 'Secrets management'], estimatedDays: 7 },
          { name: 'Monitoring & Security', description: 'Logging, alerting, security hardening', deliverables: ['Monitoring dashboards', 'Alert rules', 'Security checklist'], estimatedDays: 5 },
        ],
        suggestedBudgetRange: { min: 2000, max: 10000, currency: 'USD' },
        techStack: ['Docker', 'Terraform', 'GitHub Actions', 'AWS'],
      },
    ];

    for (const seed of seeds) {
      await this.db.insert('project_templates', {
        name: seed.name,
        description: seed.description,
        category: seed.category,
        milestones: JSON.stringify(seed.milestones),
        suggested_budget_range: JSON.stringify(seed.suggestedBudgetRange),
        tech_stack: JSON.stringify(seed.techStack),
        is_platform: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    this.logger.log('Seeded 5 platform project templates');
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private parseJson(value: any, fallback: any) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value; // already parsed (JSONB)
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private transform(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      milestones: this.parseJson(row.milestones, []),
      suggestedBudgetRange: this.parseJson(row.suggested_budget_range, null),
      techStack: this.parseJson(row.tech_stack, []),
      isPlatform: row.is_platform,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
