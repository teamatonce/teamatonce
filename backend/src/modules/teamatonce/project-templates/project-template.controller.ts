import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ProjectTemplateService } from './project-template.service';
import {
  CreateProjectTemplateDto,
  UseTemplateDto,
} from './dto/project-template.dto';

@ApiTags('project-templates')
@ApiBearerAuth()
@Controller('project-templates')
@UseGuards(JwtAuthGuard)
export class ProjectTemplateController {
  constructor(
    private readonly templateService: ProjectTemplateService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  async createTemplate(@Req() req: any, @Body() dto: CreateProjectTemplateDto) {
    const userId = req.user.sub || req.user.userId;
    return this.templateService.createTemplate(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List project templates with optional filters' })
  @ApiResponse({ status: 200, description: 'Templates listed' })
  async listTemplates(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.templateService.listTemplates({ category, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project template by ID' })
  @ApiResponse({ status: 200, description: 'Template retrieved' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('id') id: string) {
    return this.templateService.getTemplate(id);
  }

  @Post(':id/use')
  @ApiOperation({
    summary: 'Create a project from a template',
    description:
      'Clones the template milestones into a brand-new project owned by the current user.',
  })
  @ApiResponse({ status: 201, description: 'Project created from template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async useTemplate(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UseTemplateDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.templateService.createProjectFromTemplate(userId, id, dto);
  }
}
