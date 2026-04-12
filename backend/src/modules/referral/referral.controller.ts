import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Res,
  HttpStatus,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralService, ConfigureRewardsDto } from './referral.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Referral Program')
@Controller('referrals')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly configService: ConfigService,
  ) {}

  // ============================================
  // AUTHENTICATED ENDPOINTS
  // ============================================

  @Post('code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate my referral code' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Referral code generated successfully',
  })
  async generateReferralCode(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    return this.referralService.generateReferralCode(userId);
  }

  @Get('code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my referral code' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Referral code retrieved',
  })
  async getReferralCode(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    const result = await this.referralService.getReferralCode(userId);
    if (!result) {
      return { code: null, message: 'No referral code generated yet. Use POST /referrals/code to generate one.' };
    }
    return result;
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my referral dashboard stats' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Referral stats retrieved successfully',
  })
  async getReferralStats(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    return this.referralService.getReferralStats(userId);
  }

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get('track/:code')
  @ApiOperation({ summary: 'Track referral link click and redirect to signup' })
  @ApiParam({ name: 'code', description: 'Referral code (e.g., REF-ABCDE)' })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect to signup page with referral code',
  })
  async trackClick(
    @Param('code') code: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res() res: Response,
  ) {
    await this.referralService.trackClick(code, ip, userAgent);

    // Redirect to signup page with referral code
    const frontendUrl = this.configService.get('FRONTEND_URL', 'https://teamatonce.com');
    res.redirect(302, `${frontendUrl}/signup?ref=${code}`);
  }

  // ============================================
  // INTERNAL ENDPOINTS (called during registration)
  // ============================================

  @Post('signup')
  @ApiOperation({ summary: 'Track referral signup (called during registration if referral code provided)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'REF-ABCDE', description: 'Referral code used during signup' },
        newUserId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'The new user ID' },
      },
      required: ['code', 'newUserId'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Referral signup tracked',
  })
  async trackSignup(
    @Body('code') code: string,
    @Body('newUserId') newUserId: string,
  ) {
    return this.referralService.trackSignup(code, newUserId);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Post('config/rewards')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure referral reward amounts (admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        referrerReward: { type: 'number', example: 50, description: 'Reward for the referrer (USD)' },
        referredReward: { type: 'number', example: 25, description: 'Reward for the referred user (USD)' },
      },
      required: ['referrerReward', 'referredReward'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reward configuration updated',
  })
  async configureRewards(@Body() dto: ConfigureRewardsDto) {
    return this.referralService.configureRewards(dto);
  }
}
