import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'User ID of the person being reviewed' })
  @IsString()
  targetId: string;

  @ApiProperty({ description: 'Project ID associated with this review' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ description: 'Communication rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  communicationRating: number;

  @ApiProperty({ description: 'Quality rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  qualityRating: number;

  @ApiProperty({ description: 'Timeliness rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  timelinessRating: number;

  @ApiProperty({ description: 'Overall rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating: number;

  @ApiPropertyOptional({ description: 'Written review text (max 2000 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewText?: string;
}

export class RespondToReviewDto {
  @ApiProperty({ description: 'Response text to the review' })
  @IsString()
  @MaxLength(2000)
  responseText: string;
}

export class ReportReviewDto {
  @ApiProperty({ description: 'Reason for reporting the review' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class ReviewQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
