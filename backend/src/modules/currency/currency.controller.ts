import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrencyService } from './currency.service';

@ApiTags('Multi-Currency')
@Controller()
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get('currencies')
  @ApiOperation({ summary: 'List supported currencies' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Supported currencies retrieved',
  })
  getSupportedCurrencies() {
    return this.currencyService.getSupportedCurrencies();
  }

  @Get('currencies/rates')
  @ApiOperation({ summary: 'Get current exchange rates' })
  @ApiQuery({
    name: 'base',
    required: false,
    type: String,
    description: 'Base currency code (default: USD)',
    example: 'USD',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Exchange rates retrieved',
  })
  async getExchangeRates(@Query('base') base: string = 'USD') {
    return this.currencyService.getExchangeRates(base);
  }

  @Post('currencies/convert')
  @ApiOperation({ summary: 'Convert amount between currencies' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 100, description: 'Amount to convert' },
        from: { type: 'string', example: 'USD', description: 'Source currency code' },
        to: { type: 'string', example: 'EUR', description: 'Target currency code' },
      },
      required: ['amount', 'from', 'to'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversion result',
  })
  async convert(
    @Body('amount') amount: number,
    @Body('from') from: string,
    @Body('to') to: string,
  ) {
    return this.currencyService.convert(amount, from, to);
  }

  // ============================================
  // AUTHENTICATED ENDPOINTS
  // ============================================

  @Patch('users/me/currency')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set my preferred display currency' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        currency: {
          type: 'string',
          example: 'EUR',
          description: 'Preferred currency code (one of the 15 supported currencies)',
        },
      },
      required: ['currency'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preferred currency updated',
  })
  async setPreferredCurrency(
    @Request() req: any,
    @Body('currency') currency: string,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.currencyService.setUserPreferredCurrency(userId, currency);
  }

  @Get('users/me/currency')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my preferred display currency' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preferred currency retrieved',
  })
  async getPreferredCurrency(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    const currency = await this.currencyService.getUserPreferredCurrency(userId);
    return { preferredCurrency: currency };
  }
}
