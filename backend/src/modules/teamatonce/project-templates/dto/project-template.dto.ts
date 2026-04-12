import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum TemplateCategory {
  WEB_APP = 'web-app',
  MOBILE_APP = 'mobile-app',
  API = 'api',
  DESIGN = 'design',
  DEVOPS = 'devops',
}

export class MilestoneTemplateDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  deliverables?: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  estimatedDays?: number;
}

export class CreateProjectTemplateDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: TemplateCategory })
  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @ApiPropertyOptional({ type: [MilestoneTemplateDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MilestoneTemplateDto)
  milestones?: MilestoneTemplateDto[];

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  suggestedBudgetRange?: { min: number; max: number; currency?: string };

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  techStack?: string[];
}

export class UseTemplateDto {
  @ApiProperty()
  @IsString()
  projectName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}
