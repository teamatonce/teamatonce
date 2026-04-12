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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  RespondToReviewDto,
  ReportReviewDto,
  ReviewQueryDto,
} from './reviews.dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ============================================
  // CREATE REVIEW (authed)
  // ============================================

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a review for a project participant' })
  @ApiResponse({ status: 201, description: 'Review created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or self-review' })
  @ApiResponse({ status: 403, description: 'Not a project participant' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 409, description: 'Duplicate review' })
  async createReview(@Req() req: any, @Body() dto: CreateReviewDto) {
    const reviewerId = req.user.sub || req.user.userId;
    return this.reviewsService.createReview(reviewerId, dto);
  }

  // ============================================
  // GET REVIEWS FOR USER (public)
  // ============================================

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all reviews for a user (public)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Returns paginated reviews for the user' })
  async getReviewsForUser(
    @Param('userId') userId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewsService.getReviewsForUser(userId, query);
  }

  // ============================================
  // GET REVIEWS FOR PROJECT (authed)
  // ============================================

  @Get('project/:projectId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all reviews for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Returns reviews for the project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getReviewsForProject(@Param('projectId') projectId: string) {
    return this.reviewsService.getReviewsForProject(projectId);
  }

  // ============================================
  // GET REPUTATION SCORE (public)
  // ============================================

  @Get('reputation/:userId')
  @ApiOperation({ summary: 'Get reputation score for a user (public)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Returns reputation score and trust badge' })
  async getReputationScore(@Param('userId') userId: string) {
    return this.reviewsService.getReputationScore(userId);
  }

  // ============================================
  // RESPOND TO REVIEW (authed)
  // ============================================

  @Post(':id/respond')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Respond to a review (reviewed party only)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 201, description: 'Response added successfully' })
  @ApiResponse({ status: 403, description: 'Not the reviewed party' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiResponse({ status: 409, description: 'Response already submitted' })
  async respondToReview(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RespondToReviewDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.reviewsService.respondToReview(id, userId, dto.responseText);
  }

  // ============================================
  // REPORT REVIEW (authed)
  // ============================================

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report an inappropriate review' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 201, description: 'Review reported successfully' })
  @ApiResponse({ status: 400, description: 'Cannot report own review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiResponse({ status: 409, description: 'Already reported' })
  async reportReview(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReportReviewDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.reviewsService.reportReview(id, userId, dto.reason);
  }
}
