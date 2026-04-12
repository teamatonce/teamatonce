import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUrl,
  IsArray,
  IsDateString,
  MaxLength,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Portfolio item category enum
 */
export enum PortfolioCategory {
  WEB_APP = 'web-app',
  MOBILE_APP = 'mobile-app',
  API = 'api',
  DESIGN = 'design',
  DATA = 'data',
  DEVOPS = 'devops',
  OTHER = 'other',
}

/**
 * Portfolio item source enum
 */
export enum PortfolioSource {
  MANUAL = 'manual',
  GITHUB_IMPORT = 'github_import',
}

/**
 * DTO for creating a portfolio item
 */
export class CreatePortfolioItemDto {
  @ApiProperty({ description: 'Title of the portfolio item', example: 'E-commerce Platform' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Description of the portfolio item' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @ApiProperty({ enum: PortfolioCategory, description: 'Category of the portfolio item' })
  @IsEnum(PortfolioCategory)
  category: PortfolioCategory;

  @ApiProperty({ description: 'Technologies used', example: ['React', 'Node.js', 'PostgreSQL'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  tech_stack: string[];

  @ApiPropertyOptional({ description: 'Screenshot URLs (max 5)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  images?: string[];

  @ApiPropertyOptional({ description: 'Live demo URL' })
  @IsOptional()
  @IsUrl()
  live_demo_url?: string;

  @ApiPropertyOptional({ description: 'GitHub repository URL' })
  @IsOptional()
  @IsUrl()
  github_url?: string;

  @ApiPropertyOptional({ description: 'Client name (for case studies)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_name?: string;

  @ApiPropertyOptional({ description: 'Project outcomes', example: 'Reduced load time by 60%' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcomes?: string;

  @ApiProperty({ description: 'Project start date' })
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({ description: 'Project end date' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Whether this item is featured on the profile', default: false })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;
}

/**
 * DTO for updating a portfolio item
 */
export class UpdatePortfolioItemDto {
  @ApiPropertyOptional({ description: 'Title of the portfolio item' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Description of the portfolio item' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: PortfolioCategory })
  @IsOptional()
  @IsEnum(PortfolioCategory)
  category?: PortfolioCategory;

  @ApiPropertyOptional({ description: 'Technologies used', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tech_stack?: string[];

  @ApiPropertyOptional({ description: 'Screenshot URLs (max 5)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  images?: string[];

  @ApiPropertyOptional({ description: 'Live demo URL' })
  @IsOptional()
  @IsUrl()
  live_demo_url?: string;

  @ApiPropertyOptional({ description: 'GitHub repository URL' })
  @IsOptional()
  @IsUrl()
  github_url?: string;

  @ApiPropertyOptional({ description: 'Client name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_name?: string;

  @ApiPropertyOptional({ description: 'Project outcomes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcomes?: string;

  @ApiPropertyOptional({ description: 'Project start date' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Project end date' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Whether this item is featured on the profile' })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;
}

/**
 * DTO for importing from GitHub
 */
export class ImportGitHubDto {
  @ApiProperty({ description: 'GitHub personal access token' })
  @IsString()
  github_token: string;
}

/**
 * DTO for creating a code snippet
 */
export class CreateCodeSnippetDto {
  @ApiProperty({ description: 'Programming language', example: 'typescript' })
  @IsString()
  @MaxLength(50)
  language: string;

  @ApiProperty({ description: 'Filename', example: 'auth.service.ts' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ description: 'Code content (max 5000 chars)' })
  @IsString()
  @MaxLength(5000)
  code: string;
}
