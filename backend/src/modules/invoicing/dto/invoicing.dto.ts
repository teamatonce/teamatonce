import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';

export class InvoiceFilterDto {
  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter start date (ISO)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter end date (ISO)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class TaxYearQueryDto {
  @ApiProperty({ description: 'Tax year', example: 2026 })
  @IsString()
  year: string;
}

export class SubmitW8BENDto {
  @ApiProperty({ description: 'Legal name as shown on tax documents' })
  @IsString()
  legalName: string;

  @ApiProperty({ description: 'Country of residence' })
  @IsString()
  countryOfResidence: string;

  @ApiProperty({ description: 'Foreign tax identifying number' })
  @IsString()
  taxId: string;

  @ApiPropertyOptional({ description: 'Signature date (ISO)' })
  @IsOptional()
  @IsDateString()
  signatureDate?: string;
}
