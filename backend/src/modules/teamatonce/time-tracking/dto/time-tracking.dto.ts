import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// ENUMS
// ============================================

export enum TimeEntryStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum TimesheetStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// ============================================
// TIME ENTRY DTOs
// ============================================

export class StartTimerDto {
  @ApiProperty({ description: 'Project ID to track time for' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({ description: 'Milestone ID (optional)' })
  @IsOptional()
  @IsString()
  milestoneId?: string;

  @ApiPropertyOptional({ description: 'Description of work being done' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class StopTimerDto {
  // No body needed — entryId comes from route param
}

export class ManualTimeEntryDto {
  @ApiProperty({ description: 'Project ID' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({ description: 'Milestone ID' })
  @IsOptional()
  @IsString()
  milestoneId?: string;

  @ApiProperty({ description: 'Start time (ISO 8601)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'End time (ISO 8601)' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Description of work done' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetTimeEntriesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsEnum(TimeEntryStatus)
  status?: TimeEntryStatus;

  @ApiPropertyOptional({ description: 'Filter entries from this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter entries until this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

// ============================================
// TIMESHEET DTOs
// ============================================

export class SubmitTimesheetDto {
  @ApiProperty({ description: 'Week start date (ISO 8601 date, e.g. 2026-04-06)' })
  @IsDateString()
  weekStart: string;
}

export class RejectTimesheetDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
