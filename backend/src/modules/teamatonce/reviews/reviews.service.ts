import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateReviewDto, ReviewQueryDto } from './reviews.dto';

export type TrustBadge = 'verified' | 'rising' | 'new';

@Injectable()
export class ReviewsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a review after project completion.
   * Validates project participation, completion status, self-review prevention,
   * and duplicate prevention.
   */
  async createReview(reviewerId: string, dto: CreateReviewDto) {
    const { targetId, projectId } = dto;

    // Prevent self-reviews
    if (reviewerId === targetId) {
      throw new BadRequestException('You cannot review yourself');
    }

    // Verify project exists and is completed
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status !== 'completed') {
      throw new BadRequestException(
        'Reviews can only be submitted for completed projects',
      );
    }

    // Verify reviewer is a project participant
    const reviewerMembership = await this.db.findOne('project_members', {
      project_id: projectId,
      user_id: reviewerId,
    });

    // Also check if the reviewer is the project client
    const isReviewerClient = project.client_id === reviewerId;

    if (!reviewerMembership && !isReviewerClient) {
      throw new ForbiddenException(
        'Only project participants can submit reviews',
      );
    }

    // Verify target is a project participant
    const targetMembership = await this.db.findOne('project_members', {
      project_id: projectId,
      user_id: targetId,
    });

    const isTargetClient = project.client_id === targetId;

    if (!targetMembership && !isTargetClient) {
      throw new BadRequestException(
        'The review target must be a project participant',
      );
    }

    // Check for duplicate review
    const existing = await this.db.findOne('reviews', {
      reviewer_id: reviewerId,
      target_id: targetId,
      project_id: projectId,
    });

    if (existing) {
      throw new ConflictException(
        'You have already reviewed this participant for this project',
      );
    }

    // Calculate weighted average score
    const weightedAverage =
      dto.communicationRating * 0.2 +
      dto.qualityRating * 0.3 +
      dto.timelinessRating * 0.2 +
      dto.overallRating * 0.3;

    const review = await this.db.insert('reviews', {
      reviewer_id: reviewerId,
      target_id: targetId,
      project_id: projectId,
      communication_rating: dto.communicationRating,
      quality_rating: dto.qualityRating,
      timeliness_rating: dto.timelinessRating,
      overall_rating: dto.overallRating,
      review_text: dto.reviewText || null,
    });

    // Enrich with reviewer info
    const reviewer = await this.db.getUserById(reviewerId);

    return {
      ...review,
      weightedAverage: Number(weightedAverage.toFixed(2)),
      reviewer: reviewer
        ? { id: reviewer.id, name: reviewer.name, avatar: reviewer.avatar }
        : null,
    };
  }

  /**
   * Get all reviews for a user with pagination.
   */
  async getReviewsForUser(userId: string, options?: ReviewQueryDto) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    const reviews = await this.db.findMany(
      'reviews',
      { target_id: userId },
      { orderBy: 'created_at', order: 'desc', limit, offset },
    );

    // Get total count
    const allReviews = await this.db.findMany('reviews', {
      target_id: userId,
    });
    const total = allReviews.length;

    // Enrich each review with reviewer and project info
    const enriched = await Promise.all(
      reviews.map(async (review: any) => {
        const reviewer = await this.db.getUserById(review.reviewer_id);
        const project = await this.db.findOne('projects', {
          id: review.project_id,
        });
        return {
          ...review,
          reviewer: reviewer
            ? { id: reviewer.id, name: reviewer.name, avatar: reviewer.avatar }
            : null,
          project: project
            ? { id: project.id, name: project.name }
            : null,
        };
      }),
    );

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all reviews for a project.
   */
  async getReviewsForProject(projectId: string) {
    const project = await this.db.findOne('projects', {
      id: projectId,
      deleted_at: null,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const reviews = await this.db.findMany(
      'reviews',
      { project_id: projectId },
      { orderBy: 'created_at', order: 'desc' },
    );

    return Promise.all(
      reviews.map(async (review: any) => {
        const reviewer = await this.db.getUserById(review.reviewer_id);
        const target = await this.db.getUserById(review.target_id);
        return {
          ...review,
          reviewer: reviewer
            ? { id: reviewer.id, name: reviewer.name, avatar: reviewer.avatar }
            : null,
          target: target
            ? { id: target.id, name: target.name, avatar: target.avatar }
            : null,
        };
      }),
    );
  }

  /**
   * Calculate aggregate reputation score for a user.
   */
  async getReputationScore(userId: string) {
    const reviews = await this.db.findMany('reviews', {
      target_id: userId,
    });

    // Get projects where the user is a member
    const memberships = await this.db.findMany('project_members', {
      user_id: userId,
    });

    const memberProjectIds = memberships.map((m: any) => m.project_id);

    // Also include projects where the user is the client
    const clientProjects = await this.db.findMany('projects', {
      client_id: userId,
      deleted_at: null,
    });

    const allProjectIds = [
      ...new Set([
        ...memberProjectIds,
        ...clientProjects.map((p: any) => p.id),
      ]),
    ];

    // Fetch all projects to calculate rates
    const allProjects: any[] = [];
    for (const pid of allProjectIds) {
      const p = await this.db.findOne('projects', { id: pid, deleted_at: null });
      if (p) allProjects.push(p);
    }

    const totalProjects = allProjects.length;
    const completedProjects = allProjects.filter(
      (p: any) => p.status === 'completed',
    );
    const completedCount = completedProjects.length;

    // Completion rate
    const completionRate =
      totalProjects > 0
        ? Number(((completedCount / totalProjects) * 100).toFixed(1))
        : 0;

    // On-time delivery rate
    const onTimeCount = completedProjects.filter((p: any) => {
      if (!p.expected_completion_date || !p.actual_completion_date) return true;
      return (
        new Date(p.actual_completion_date) <=
        new Date(p.expected_completion_date)
      );
    }).length;

    const onTimeDeliveryRate =
      completedCount > 0
        ? Number(((onTimeCount / completedCount) * 100).toFixed(1))
        : 0;

    // Average ratings
    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      const trustBadge = this.calculateTrustBadge(completedCount, 0);
      return {
        averageRating: null,
        averageCommunication: null,
        averageQuality: null,
        averageTimeliness: null,
        totalReviews: 0,
        completedProjects: completedCount,
        completionRate,
        onTimeDeliveryRate,
        trustBadge,
      };
    }

    const sumOverall = reviews.reduce(
      (s: number, r: any) => s + r.overall_rating,
      0,
    );
    const sumComm = reviews.reduce(
      (s: number, r: any) => s + r.communication_rating,
      0,
    );
    const sumQuality = reviews.reduce(
      (s: number, r: any) => s + r.quality_rating,
      0,
    );
    const sumTime = reviews.reduce(
      (s: number, r: any) => s + r.timeliness_rating,
      0,
    );

    const averageRating = Number((sumOverall / totalReviews).toFixed(2));
    const averageCommunication = Number((sumComm / totalReviews).toFixed(2));
    const averageQuality = Number((sumQuality / totalReviews).toFixed(2));
    const averageTimeliness = Number((sumTime / totalReviews).toFixed(2));

    const trustBadge = this.calculateTrustBadge(completedCount, averageRating);

    return {
      averageRating,
      averageCommunication,
      averageQuality,
      averageTimeliness,
      totalReviews,
      completedProjects: completedCount,
      completionRate,
      onTimeDeliveryRate,
      trustBadge,
    };
  }

  /**
   * Allow the reviewed party to respond to a review.
   */
  async respondToReview(
    reviewId: string,
    userId: string,
    responseText: string,
  ) {
    const review = await this.db.findOne('reviews', { id: reviewId });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.target_id !== userId) {
      throw new ForbiddenException(
        'Only the reviewed party can respond to a review',
      );
    }

    if (review.response_text) {
      throw new ConflictException(
        'A response has already been submitted for this review',
      );
    }

    const updated = await this.db.update('reviews', reviewId, {
      response_text: responseText,
      response_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Report an inappropriate review.
   */
  async reportReview(reviewId: string, userId: string, reason: string) {
    const review = await this.db.findOne('reviews', { id: reviewId });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Prevent the reviewer from reporting their own review
    if (review.reviewer_id === userId) {
      throw new BadRequestException('You cannot report your own review');
    }

    if (review.is_reported) {
      throw new ConflictException('This review has already been reported');
    }

    const updated = await this.db.update('reviews', reviewId, {
      is_reported: true,
      report_reason: reason,
      updated_at: new Date().toISOString(),
    });

    return { success: true, message: 'Review reported successfully', review: updated };
  }

  /**
   * Calculate trust badge based on completed projects and average rating.
   */
  calculateTrustBadge(completedProjects: number, averageRating: number): TrustBadge {
    if (completedProjects >= 5 && averageRating >= 4) {
      return 'verified';
    }
    if (completedProjects >= 2 && averageRating >= 3.5) {
      return 'rising';
    }
    return 'new';
  }
}
