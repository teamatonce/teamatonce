import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { MfaService } from './mfa.service';
import { VerifyMfaTokenDto, DisableMfaDto, UseRecoveryCodeDto } from './mfa.dto';
import { DatabaseService } from '../../database/database.service';

@ApiTags('MFA')
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
  ) {}

  // ============================================
  // POST /auth/mfa/enable — Start MFA setup
  // ============================================

  @Post('enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable MFA — returns secret, QR code, and recovery codes' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated' })
  async enableMfa(@Request() req) {
    const userId = req.user.sub || req.user.userId;
    const result = await this.mfaService.enableMfa(userId);
    return {
      message: 'Scan the QR code with your authenticator app, then verify with /auth/mfa/verify-setup',
      ...result,
    };
  }

  // ============================================
  // POST /auth/mfa/verify-setup — Confirm authenticator setup
  // ============================================

  @Post('verify-setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify MFA setup with a TOTP token from authenticator app' })
  @ApiResponse({ status: 200, description: 'MFA activated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  async verifySetup(@Request() req, @Body() dto: VerifyMfaTokenDto) {
    const userId = req.user.sub || req.user.userId;
    await this.mfaService.verifyAndActivateMfa(userId, dto.token);
    return { message: 'MFA has been activated successfully' };
  }

  // ============================================
  // POST /auth/mfa/verify — Verify TOTP during login (semi-authed)
  // ============================================

  @Post('verify')
  @UseGuards(JwtAuthGuard) // Accepts the mfaPending temporary JWT
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP token during login to get full access token' })
  @ApiResponse({ status: 200, description: 'MFA verified, full access token returned' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP token' })
  async verifyMfa(@Request() req, @Body() dto: VerifyMfaTokenDto) {
    const userId = req.user.sub || req.user.userId;

    // Only allow this endpoint for mfaPending tokens
    if (!req.user.mfaPending) {
      return { message: 'MFA verification not required for this session' };
    }

    const isValid = await this.mfaService.verifyMfaToken(userId, dto.token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    // Issue a full-access JWT (no mfaPending flag)
    return this.issueFullToken(userId);
  }

  // ============================================
  // POST /auth/mfa/disable — Disable MFA
  // ============================================

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA (requires a valid TOTP token)' })
  @ApiResponse({ status: 200, description: 'MFA disabled' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  async disableMfa(@Request() req, @Body() dto: DisableMfaDto) {
    const userId = req.user.sub || req.user.userId;
    await this.mfaService.disableMfa(userId, dto.token);
    return { message: 'MFA has been disabled' };
  }

  // ============================================
  // POST /auth/mfa/recovery — Use a recovery code (semi-authed)
  // ============================================

  @Post('recovery')
  @UseGuards(JwtAuthGuard) // Accepts the mfaPending temporary JWT
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use a recovery code to bypass TOTP during login' })
  @ApiResponse({ status: 200, description: 'Recovery code accepted, full access token returned' })
  @ApiResponse({ status: 401, description: 'Invalid recovery code' })
  async useRecoveryCode(@Request() req, @Body() dto: UseRecoveryCodeDto) {
    const userId = req.user.sub || req.user.userId;

    if (!req.user.mfaPending) {
      return { message: 'MFA verification not required for this session' };
    }

    const used = await this.mfaService.useRecoveryCode(userId, dto.recoveryCode);
    if (!used) {
      throw new UnauthorizedException('Invalid or already used recovery code');
    }

    // Issue a full-access JWT
    return this.issueFullToken(userId);
  }

  // ============================================
  // Private — issue full JWT after MFA verification
  // ============================================

  private async issueFullToken(userId: string) {
    const user = await this.db.getUserById(userId);
    const role = user?.role || 'client';

    const payload = {
      sub: userId,
      email: user?.email,
      name: user?.name,
      role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      user: {
        id: userId,
        email: user?.email,
        name: user?.name,
        role,
      },
      accessToken,
      refreshToken: accessToken, // Same token for now — matches existing pattern
    };
  }
}
