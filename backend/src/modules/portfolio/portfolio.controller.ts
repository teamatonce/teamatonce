import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';
import {
  CreatePortfolioItemDto,
  UpdatePortfolioItemDto,
  ImportGitHubDto,
  CreateCodeSnippetDto,
} from './dto/portfolio.dto';

@ApiTags('Portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // ============================================
  // PORTFOLIO ITEM ENDPOINTS
  // ============================================

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a portfolio item',
    description: 'Create a new portfolio item for the authenticated user.',
  })
  @ApiResponse({ status: 201, description: 'Portfolio item created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPortfolioItem(@Request() req: any, @Body() dto: CreatePortfolioItemDto) {
    const userId = req.user.sub || req.user.userId;
    return this.portfolioService.createPortfolioItem(userId, dto);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get portfolio items for a user',
    description: 'Retrieve all portfolio items for a specific user (public, paginated).',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 50)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiResponse({ status: 200, description: 'Portfolio items retrieved successfully' })
  async getPortfolioByUser(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.portfolioService.getPortfolioByUser(userId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
    });
  }

  @Get('user/:userId/featured')
  @ApiOperation({
    summary: 'Get featured portfolio items',
    description: 'Retrieve featured portfolio items for a user (for profile cards).',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Featured portfolio items retrieved' })
  async getFeaturedPortfolio(@Param('userId') userId: string) {
    return this.portfolioService.getFeaturedPortfolio(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single portfolio item',
    description: 'Retrieve a portfolio item by its ID (public).',
  })
  @ApiParam({ name: 'id', description: 'Portfolio item ID' })
  @ApiResponse({ status: 200, description: 'Portfolio item retrieved' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found' })
  async getPortfolioItem(@Param('id') id: string) {
    return this.portfolioService.getPortfolioItem(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a portfolio item',
    description: 'Update an existing portfolio item (must be owner).',
  })
  @ApiParam({ name: 'id', description: 'Portfolio item ID' })
  @ApiResponse({ status: 200, description: 'Portfolio item updated' })
  @ApiResponse({ status: 403, description: 'Not the owner' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found' })
  async updatePortfolioItem(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdatePortfolioItemDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.portfolioService.updatePortfolioItem(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a portfolio item',
    description: 'Delete a portfolio item and its associated snippets (must be owner).',
  })
  @ApiParam({ name: 'id', description: 'Portfolio item ID' })
  @ApiResponse({ status: 200, description: 'Portfolio item deleted' })
  @ApiResponse({ status: 403, description: 'Not the owner' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found' })
  async deletePortfolioItem(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    return this.portfolioService.deletePortfolioItem(id, userId);
  }

  // ============================================
  // GITHUB IMPORT
  // ============================================

  @Post('import/github')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import portfolio items from GitHub',
    description: 'Import pinned/top repositories from GitHub as portfolio items.',
  })
  @ApiResponse({ status: 201, description: 'GitHub repos imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or import failed' })
  async importFromGitHub(@Request() req: any, @Body() dto: ImportGitHubDto) {
    const userId = req.user.sub || req.user.userId;
    return this.portfolioService.importFromGitHub(userId, dto.github_token);
  }

  // ============================================
  // CODE SNIPPETS
  // ============================================

  @Post(':id/snippets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a code snippet to a portfolio item',
    description: 'Add a code snippet with language and filename to a portfolio item (must be owner).',
  })
  @ApiParam({ name: 'id', description: 'Portfolio item ID' })
  @ApiResponse({ status: 201, description: 'Code snippet added' })
  @ApiResponse({ status: 403, description: 'Not the owner' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found' })
  async addCodeSnippet(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: CreateCodeSnippetDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.portfolioService.addCodeSnippet(id, userId, dto);
  }

  @Get(':id/snippets')
  @ApiOperation({
    summary: 'Get code snippets for a portfolio item',
    description: 'List all code snippets for a portfolio item (public).',
  })
  @ApiParam({ name: 'id', description: 'Portfolio item ID' })
  @ApiResponse({ status: 200, description: 'Code snippets retrieved' })
  @ApiResponse({ status: 404, description: 'Portfolio item not found' })
  async getSnippets(@Param('id') id: string) {
    return this.portfolioService.getSnippets(id);
  }
}
