import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvoicingService } from './invoicing.service';
import { SubmitW8BENDto } from './dto/invoicing.dto';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  /**
   * List invoices for the authenticated user (as client or contractor).
   */
  @Get()
  @ApiOperation({ summary: 'List my invoices' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listInvoices(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.invoicingService.listInvoices(userId, {
        projectId,
        status,
        startDate,
        endDate,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to list invoices',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get invoice summary stats.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get invoice summary stats' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  async getInvoiceStats(@Req() req: any) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const stats = await this.invoicingService.getInvoiceStats(userId);
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get invoice stats',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get 1099 summary for a tax year (for clients).
   */
  @Get('tax/1099-summary')
  @ApiOperation({ summary: 'Get 1099 summary for a tax year' })
  @ApiResponse({ status: 200, description: '1099 summary retrieved successfully' })
  @ApiQuery({ name: 'year', required: true, example: '2026' })
  async get1099Summary(@Req() req: any, @Query('year') year: string) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      if (!year) {
        throw new HttpException('Year parameter is required', HttpStatus.BAD_REQUEST);
      }

      const summary = await this.invoicingService.generate1099Summary(userId, year);
      return {
        success: true,
        data: summary,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate 1099 summary',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Submit W-8BEN tax information.
   */
  @Post('tax/w8ben')
  @ApiOperation({ summary: 'Submit W-8BEN tax information' })
  @ApiResponse({ status: 201, description: 'W-8BEN information submitted successfully' })
  async submitW8BEN(@Req() req: any, @Body() dto: SubmitW8BENDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.invoicingService.collectW8BEN(userId, dto);
      return {
        success: true,
        message: 'W-8BEN information submitted successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to submit W-8BEN information',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get W-8BEN status.
   */
  @Get('tax/w8ben')
  @ApiOperation({ summary: 'Get W-8BEN status' })
  @ApiResponse({ status: 200, description: 'W-8BEN status retrieved successfully' })
  async getW8BENStatus(@Req() req: any) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const status = await this.invoicingService.getW8BENStatus(userId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get W-8BEN status',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get single invoice details.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details' })
  @ApiResponse({ status: 200, description: 'Invoice retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoice(@Param('id') id: string, @Req() req: any) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const invoice = await this.invoicingService.getInvoice(id, userId);
      return {
        success: true,
        data: invoice,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get invoice',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Download invoice as HTML (PDF placeholder).
   */
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download invoice as HTML' })
  @ApiResponse({ status: 200, description: 'Invoice HTML generated successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoicePdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const html = await this.invoicingService.getInvoicePdf(id, userId);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${id}.html"`);
      res.send(html);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate invoice PDF',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }
}
