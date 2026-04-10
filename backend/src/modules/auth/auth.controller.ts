import { Controller, Post, Body, Get, Put, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException, HttpException, Param, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import * as multer from 'multer';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, AuthUpdateProfileDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import {
  SocialAuthInitDto,
  SocialAuthCallbackDto,
  SocialAuthDto,
  LinkSocialAccountDto,
  UnlinkSocialAccountDto,
  ConfigureSocialProviderDto,
  SocialProvider
} from './dto/social-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto) {
    return await this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req) {
    // Pass the entire JWT payload which contains email, name, username
    return await this.authService.validateUser(req.user.sub, req.user);
  }


  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh JWT token' })
  async refreshToken(@Request() req) {
    return await this.authService.refreshToken(req.user.sub);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  async logout(@Request() req) {
    return await this.authService.logout(req.user.sub);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(@Request() req, @Body() dto: AuthUpdateProfileDto) {
    return await this.authService.updateProfile(req.user.sub, dto);
  }

  @Post('profile/image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload profile image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profileImage: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: multer.memoryStorage(), // Use memory storage for buffer access
      fileFilter: (req, file, cb) => {
        // Accept only image files
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async uploadProfileImage(@Request() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Upload to storage service
    const result = await this.authService.uploadProfileImage(req.user.sub, file);

    return result;
  }

  // ============================================
  // OAUTH ENDPOINTS (Direct OAuth like imagitar)
  // ============================================

  /**
   * Helper to get the appropriate frontend URL from state or query param
   */
  private getFrontendUrl(req: any, state?: string): string {
    // First, try to decode state parameter (used in OAuth callback)
    if (state) {
      try {
        const decoded = Buffer.from(state, 'base64').toString('utf-8');
        // State format: randomState|frontendUrl
        if (decoded.includes('|')) {
          const [, frontendUrl] = decoded.split('|');
          if (frontendUrl) {
            return frontendUrl;
          }
        }
      } catch (e) {
        // Ignore decoding errors
      }
    }

    // Fallback: Check for explicit frontendUrl query parameter
    return req.query?.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  @Get('oauth/github')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({ summary: 'Initiate GitHub OAuth flow via database' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend URL for redirect after auth' })
  async githubOAuth(@Request() req, @Res() res: Response) {
    const frontendUrl = this.getFrontendUrl(req);
    const authUrl = await this.authService.getGitHubAuthUrl(frontendUrl);
    return res.redirect(authUrl);
  }

  @Get('oauth/google')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({ summary: 'Initiate Google OAuth flow via database' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend URL for redirect after auth' })
  async googleOAuth(@Request() req, @Res() res: Response) {
    const frontendUrl = this.getFrontendUrl(req);
    const authUrl = await this.authService.getGoogleAuthUrl(frontendUrl);
    return res.redirect(authUrl);
  }

  @Post('oauth/exchange')
  @ApiOperation({ summary: 'Exchange database token for Team@Once JWT' })
  async exchangeOAuthToken(@Body() dto: { authToken: string; userId: string; email: string; role?: string }) {
    return await this.authService.exchangedatabaseToken(dto.authToken, dto.userId, dto.email, dto.role);
  }

  @Post('complete-social-signup')
  @ApiOperation({
    summary: 'Complete social signup by setting user role',
    description: 'Called when new social auth user selects their role (client or seller)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'role'],
      properties: {
        userId: { type: 'string', description: 'User ID' },
        role: { type: 'string', enum: ['client', 'seller'], description: 'User role' }
      }
    }
  })
  async completeSocialSignup(@Body() dto: { userId: string; role: 'client' | 'seller' }) {
    return await this.authService.completeSocialSignup(dto.userId, dto.role);
  }

  // NOTE: OAuth callback is handled by database backend
  // GitHub/Google redirects to storage backend callback
  // database backend exchanges code for tokens and redirects to Team@Once frontend with tokens
  // Team@Once frontend receives tokens and exchanges them for Team@Once JWT

  // ============================================

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Send password reset instructions to the provided email address'
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent (if account exists)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Reset password using the token received via email'
  })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token'
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ============================================
  // Social Authentication Endpoints
  // ============================================

  @Get('social/providers')
  @ApiOperation({
    summary: 'Get available social providers',
    description: 'Returns a list of all available OAuth providers and their configuration'
  })
  async getSocialProviders() {
    return await this.authService.getSocialProviders();
  }

  @Post('social/:provider/init')
  @ApiOperation({
    summary: 'Initialize social authentication flow',
    description: 'Generates OAuth authorization URL for the specified provider'
  })
  @ApiParam({
    name: 'provider',
    enum: SocialProvider,
    description: 'OAuth provider name'
  })
  async initSocialAuth(
    @Param('provider') provider: SocialProvider,
    @Body() dto: Partial<SocialAuthInitDto>
  ) {
    return await this.authService.initSocialAuth({
      provider,
      ...dto,
    });
  }

  @Post('social/:provider/callback')
  @ApiOperation({
    summary: 'Handle OAuth callback',
    description: 'Processes OAuth callback with authorization code and authenticates user'
  })
  @ApiParam({
    name: 'provider',
    enum: SocialProvider,
    description: 'OAuth provider name'
  })
  async handleSocialCallback(
    @Param('provider') provider: SocialProvider,
    @Body() dto: Omit<SocialAuthCallbackDto, 'provider'>
  ) {
    return await this.authService.handleSocialCallback({
      provider,
      ...dto,
    });
  }

  @Post('social/auth')
  @ApiOperation({
    summary: 'Direct social authentication',
    description: 'Authenticate using an existing OAuth access token'
  })
  async socialAuth(@Body() dto: SocialAuthDto) {
    return await this.authService.socialAuth(dto);
  }

  @Post('social/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link social account',
    description: 'Links a social account to the authenticated user'
  })
  async linkSocialAccount(@Request() req, @Body() dto: LinkSocialAccountDto) {
    return await this.authService.linkSocialAccount(req.user.sub, dto);
  }

  @Post('social/unlink')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Unlink social account',
    description: 'Removes a linked social account from the authenticated user'
  })
  async unlinkSocialAccount(@Request() req, @Body() dto: UnlinkSocialAccountDto) {
    return await this.authService.unlinkSocialAccount(req.user.sub, dto);
  }

  @Get('social/linked')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get linked accounts',
    description: 'Returns all social accounts linked to the authenticated user'
  })
  async getLinkedAccounts(@Request() req) {
    return await this.authService.getLinkedAccounts(req.user.sub);
  }

  @Post('admin/social/configure')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Configure social provider (Admin only)',
    description: 'Updates OAuth provider configuration. Requires admin privileges.'
  })
  async configureSocialProvider(@Body() dto: ConfigureSocialProviderDto) {
    // TODO: Add admin role check
    return await this.authService.configureSocialProvider(dto);
  }
}