import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, Min, Max } from 'class-validator';

/**
 * Performance Metrics Response DTO
 */
export class PerformanceMetricsDto {
  @ApiProperty({ description: 'Overall rating (0-5)', example: 4.5 })
  rating: number;

  @ApiProperty({ description: 'Total number of reviews', example: 25 })
  totalReviews: number;

  @ApiProperty({ description: 'Number of completed projects', example: 15 })
  projectsCompleted: number;

  @ApiProperty({ description: 'On-time delivery percentage', example: 95 })
  onTimeDelivery: number;

  @ApiProperty({ description: 'Code quality score', example: 4.8 })
  codeQuality: number;

  @ApiProperty({ description: 'Client satisfaction score', example: 4.7 })
  clientSatisfaction: number;

  @ApiProperty({ description: 'Average response time', example: '2 hours' })
  responseTime: string;

  @ApiProperty({ description: 'Total earnings', example: 50000 })
  totalEarnings: number;

  @ApiProperty({ description: 'Monthly earnings for the last 12 months', type: [Number] })
  monthlyEarnings: number[];

  @ApiProperty({ description: 'Hours worked for the last 12 months', type: [Number] })
  hoursWorked: number[];
}

/**
 * Developer Review DTO
 */
export class DeveloperReviewDto {
  @ApiProperty({ description: 'Review ID' })
  id: string;

  @ApiProperty({ description: 'Client name', example: 'John Smith' })
  clientName: string;

  @ApiProperty({ description: 'Rating (1-5)', example: 5 })
  rating: number;

  @ApiProperty({ description: 'Review comment' })
  comment: string;

  @ApiProperty({ description: 'Project title' })
  projectTitle: string;

  @ApiProperty({ description: 'Review date' })
  date: string;

  @ApiProperty({ description: 'Skills mentioned in review', type: [String] })
  skills: string[];
}

/**
 * Achievement DTO
 */
export class DeveloperAchievementDto {
  @ApiProperty({ description: 'Achievement ID' })
  id: string;

  @ApiProperty({ description: 'Achievement title', example: 'First Project Completed' })
  title: string;

  @ApiProperty({ description: 'Achievement description' })
  description: string;

  @ApiProperty({ description: 'Icon name', example: 'trophy' })
  icon: string;

  @ApiProperty({ description: 'Badge color', example: 'gold' })
  color: string;

  @ApiProperty({ description: 'Date earned' })
  earned: string;
}

/**
 * Skill Rating DTO
 */
export class SkillRatingDto {
  @ApiProperty({ description: 'Skill name', example: 'React' })
  skill: string;

  @ApiProperty({ description: 'Average rating for this skill', example: 4.8 })
  rating: number;

  @ApiProperty({ description: 'Number of reviews mentioning this skill', example: 10 })
  reviews: number;
}

/**
 * Developer Profile DTO
 */
export class DeveloperProfileDto {
  @ApiProperty({ description: 'Developer ID' })
  id: string;

  @ApiProperty({ description: 'Full name' })
  name: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  avatar?: string;

  @ApiPropertyOptional({ description: 'Title/Role', example: 'Senior Full Stack Developer' })
  title?: string;

  @ApiPropertyOptional({ description: 'Bio/Description' })
  bio?: string;

  @ApiPropertyOptional({ description: 'Location' })
  location?: string;

  @ApiPropertyOptional({ description: 'Timezone' })
  timezone?: string;

  @ApiProperty({ description: 'Skills list', type: [String] })
  skills: string[];

  @ApiProperty({ description: 'Hourly rate', example: 75 })
  hourlyRate: number;

  @ApiProperty({ description: 'Availability status', example: 'available' })
  availability: string;

  @ApiProperty({ description: 'Member since date' })
  memberSince: string;
  @ApiPropertyOptional({ description: 'Reputation score with trust badge' })
  reputationScore?: any;
}

/**
 * Update Developer Profile DTO
 */
export class UpdateDeveloperProfileDto {
  @ApiPropertyOptional({ description: 'Full name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Title/Role' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Bio/Description' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: 'Location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Timezone' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Skills list', type: [String] })
  @IsArray()
  @IsOptional()
  skills?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Availability status' })
  @IsString()
  @IsOptional()
  availability?: string;
}

/**
 * Dashboard Stats DTO - Aggregated dashboard data
 */
export class DashboardStatsDto {
  @ApiProperty({ description: 'Earnings data' })
  earnings: {
    thisMonth: number;
    lastMonth: number;
    total: number;
    pending: number;
    growth: number;
  };

  @ApiProperty({ description: 'Project statistics' })
  stats: {
    activeProjects: number;
    completedProjects: number;
    totalHoursTracked: number;
    averageRating: number;
  };

  @ApiProperty({ description: 'Active project list' })
  activeProjects: Array<{
    id: string;
    name: string;
    clientName: string;
    progress: number;
    dueDate: string;
    status: string;
  }>;

  @ApiProperty({ description: 'Upcoming deadlines' })
  upcomingDeadlines: Array<{
    project: string;
    milestone: string;
    dueDate: string;
    daysLeft: number;
  }>;

  @ApiProperty({ description: 'Skills verification status' })
  skillsVerification: Array<{
    skill: string;
    verified: boolean;
    level: string;
  }>;
}

/**
 * AI Matched Project DTO
 */
export class AIMatchedProjectDto {
  @ApiProperty({ description: 'Project ID' })
  id: string;

  @ApiProperty({ description: 'Project title' })
  title: string;

  @ApiProperty({ description: 'Project description' })
  description: string;

  @ApiProperty({ description: 'Client name' })
  clientName: string;

  @ApiProperty({ description: 'Client rating' })
  clientRating: number;

  @ApiProperty({ description: 'Budget range' })
  budget: {
    min: number;
    max: number;
    type: string;
  };

  @ApiProperty({ description: 'Estimated duration' })
  duration: string;

  @ApiProperty({ description: 'Required skills', type: [String] })
  requiredSkills: string[];

  @ApiProperty({ description: 'AI match percentage' })
  matchPercentage: number;

  @ApiProperty({ description: 'Posted date' })
  postedDate: string;

  @ApiProperty({ description: 'Number of proposals' })
  proposalsCount: number;

  @ApiProperty({ description: 'Project status' })
  status: string;

  @ApiProperty({ description: 'Project category' })
  category: string;
}
