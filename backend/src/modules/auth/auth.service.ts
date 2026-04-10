import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import {
  SocialProvider,
  SocialAuthInitDto,
  SocialAuthCallbackDto,
  SocialAuthDto,
  LinkSocialAccountDto,
  UnlinkSocialAccountDto,
  ConfigureSocialProviderDto,
  SocialAuthResponseDto,
  GetLinkedAccountsResponseDto,
  GetSocialProvidersResponseDto,
  LinkedAccountDto,
  SocialProviderConfigDto
} from './dto/social-auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.logger.log('Auth service initialized');
  }

  async register(dto: RegisterDto) {
    try {
      // Determine user role from DTO or default to 'client'
      const userRole = dto.role || 'client';

      // Initialize metadata for new user (without role - role goes in direct column)
      const initialMetadata = {
        learning_level: 'beginner',
        xp_points: 0,
        current_streak: 0,
        longest_streak: 0,
        total_study_time: 0,
        preferred_language: 'en',
        timezone: 'UTC',
        learning_goals: [],
        interests: [],
        skills: {},
        achievements: [],
        settings: {
          notifications_enabled: true,
          daily_reminder_time: '09:00',
          weekly_goal_hours: 5,
        }
      };

      // Register new user with role passed as direct column (not metadata)
      const response = await /* TODO: use AuthService */ this.db.signUp(dto.email, dto.password, dto.name, initialMetadata, userRole);

      if (!response || !response.user) {
        throw new BadRequestException('Registration failed');
      }

      const user = response.user;

      // Generate our own JWT token for the frontend
      const token = this.generateToken(user);

      return {
        message: 'Registration successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name || dto.name,
          role: user.role || userRole, // ✅ Read from direct role column, NOT from metadata
        },
        accessToken: token, // Our backend JWT, not database's
        refreshToken: token, // For now, use same token - can implement proper refresh later
      };
    } catch (error) {
      if (error.response?.data?.message) {
        throw new BadRequestException(error.response.data.message);
      }
      throw new BadRequestException('Registration failed: ' + error.message);
    }
  }

  async login(dto: LoginDto) {
    try {
      // Use anon key client for login
      const response = await /* TODO: use AuthService */ this.db.signIn(dto.email, dto.password);

      // Check if MFA is required
      if ((response as any).mfa_required) {
        return {
          mfa_required: true,
          user_id: (response as any).user_id,
          message: 'MFA verification required',
        };
      }

      const session = response as any;
      const user = session.user;

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Fetch full user profile to check ban status
      let fullUserProfile = user;
      try {
        const profileResult = await this.db.getUserById(user.id);
        fullUserProfile = profileResult?.user || profileResult || user;
      } catch (e) {
        this.logger.warn('Could not fetch full profile during login, using session data');
      }

      // Check if user is banned
      if (fullUserProfile?.metadata?.banned === true) {
        const banReason = fullUserProfile?.metadata?.ban_reason || 'Contact support for more information';
        throw new UnauthorizedException(`Your account has been banned. Reason: ${banReason}`);
      }

      // Store the database access token for this request
      const authToken = session.token || session.access_token;

      // Generate our own JWT token for the backend to validate
      // This is needed because our JwtAuthGuard validates with our secret, not database's
      const token = this.generateToken(fullUserProfile || user);

      // TODO: Store authToken in cache/Redis mapped to userId for future API calls

      return {
        user: {
          id: user.id,
          email: user.email,
          name: fullUserProfile?.name || user.name || '',
          avatarUrl: fullUserProfile?.avatar_url, // camelCase
          profileImage: fullUserProfile?.avatar_url, // Keep for backward compatibility
          bio: fullUserProfile?.bio,
          location: fullUserProfile?.location,
          website: fullUserProfile?.website,
          role: fullUserProfile?.role || 'client', // ✅ Read from direct role column, NOT from metadata
          // Include learning metadata
          learning_level: fullUserProfile?.metadata?.learning_level || 'beginner',
          xp_points: fullUserProfile?.metadata?.xp_points || 0,
          current_streak: fullUserProfile?.metadata?.current_streak || 0,
          total_study_time: fullUserProfile?.metadata?.total_study_time || 0,
        },
        accessToken: token, // Our backend JWT for validation
        refreshToken: token, // For now, use same token - can implement proper refresh later
      };
    } catch (error) {
      console.error('Login error:', error);
      // Re-throw UnauthorizedException as-is (for banned user message)
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (error.response?.data) {
        console.error('database error response:', error.response);
      }
      throw new UnauthorizedException('Login failed: ' + error.message);
    }
  }

  async getProfile(userId: string) {
    try {
      // Use the SDK's getUserById to get the full user profile
      const userProfile = await this.db.getUserById(userId);
      
      if (!userProfile) {
        throw new UnauthorizedException('User not found');
      }

      // Handle the actual response structure from database
      const user = userProfile.user || userProfile;
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name || user.metadata?.full_name || '',
        bio: user.bio,
        location: user.location,
        website: user.website,
        avatarUrl: user.avatar_url,
        profileImage: user.avatar_url, // Keep for backward compatibility
        dateOfBirth: user.date_of_birth,
        gender: user.gender,
        phone: user.phone,
        emailVerified: user.email_verified,
        phoneVerified: user.phone_verified,
        timezone: user.metadata?.timezone || 'UTC',
        language: user.metadata?.language || 'en',
        preferences: user.metadata?.preferences || {},
        socialLinks: user.metadata?.social_links || {},
        interests: user.metadata?.interests || [],
        role: user.role || 'client', // ✅ Read from direct role column, NOT from metadata
        // Learning-specific metadata
        learning_level: user.metadata?.learning_level || 'beginner',
        xp_points: user.metadata?.xp_points || 0,
        current_streak: user.metadata?.current_streak || 0,
        longest_streak: user.metadata?.longest_streak || 0,
        total_study_time: user.metadata?.total_study_time || 0,
        preferred_language: user.metadata?.preferred_language || 'en',
        learning_goals: user.metadata?.learning_goals || [],
        skills: user.metadata?.skills || {},
        achievements: user.metadata?.achievements || [],
        settings: user.metadata?.settings || {},
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLoginAt: user.last_login_at,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to get profile: ' + error.message);
    }
  }

  async refreshToken(userId: string) {
    try {
      // Generate a new JWT token with just the userId
      // The frontend will use this new token
      const userData = {
        id: userId,
        email: null,
        user_metadata: {}
      };

      const token = this.generateToken(userData);

      // Return camelCase to match frontend expectations
      return {
        accessToken: token,
        refreshToken: token, // For now, use same token - can implement proper refresh later
      };
    } catch (error) {
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  async logout(userId: string) {
    try {
      // Note: We don't have the user's database token stored, so we can't Call database's signOut
      // The frontend will clear its local tokens, which is sufficient for logout
      // In a production app, you might want to:
      // 1. Store user tokens in Redis/cache and clear them here
      // 2. Maintain a token blacklist
      // 3. Use refresh tokens with expiry
      
      // TODO: Clear any cached user tokens from Redis/cache when implemented
      // TODO: Add token to blacklist if using that pattern
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      console.error('Logout error:', error);
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    }
  }

  private generateToken(user: any) {
    // ✅ Extract role from direct column (fallback to metadata for backwards compatibility)
    const role = user.role || user.metadata?.role || user.app_metadata?.role || 'client';

    const payload = {
      sub: user.id,
      email: user.email,
      username: user.user_metadata?.username || user.username,
      name: user.name,
      role: role, // Include role in JWT payload
    };

    return this.jwtService.sign(payload);
  }

  async validateUser(userId: string, jwtPayload?: any) {
    try {
      // Use the database service's getUserById method
      const userProfile = await this.db.getUserById(userId);

      if (!userProfile) {
        // Fallback to JWT data if getUserById fails
        return {
          user: {
            id: userId,
            email: jwtPayload?.email || null,
            name: jwtPayload?.name || null,
            username: jwtPayload?.username || null,
            profileImage: null,
            createdAt: new Date().toISOString(),
            role: 'user',
            bio: null,
            location: null,
            website: null,
          }
        };
      }

      // Handle the actual response structure from database
      const user = userProfile.user || userProfile;

      // Check if user is banned - force logout if they are
      if (user.metadata?.banned === true) {
        const banReason = user.metadata?.ban_reason || 'Contact support for more information';
        throw new UnauthorizedException(`Your account has been banned. Reason: ${banReason}`);
      }

      // ✅ Get role from direct column (fallback to metadata for backwards compatibility)
      const userRole = user.role || user.metadata?.role || user.app_metadata?.role || 'user';

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.metadata?.full_name || '', // Use fullName from response
          username: user.username,
          profileImage: user.avatar_url, // Keep for backward compatibility
          avatarUrl: user.avatar_url,
          bio: user.bio,
          location: user.location,
          website: user.website,
          dateOfBirth: user.date_of_birth,
          gender: user.gender,
          phone: user.phone,
          emailVerified: user.email_verified, // Handle both formats
          phoneVerified: user.phone_verified,
          lastLoginAt: user.last_login_at, // Handle both formats
          createdAt: user.created_at, // Handle both formats
          updatedAt: user.updated_at, // Handle both formats
          role: userRole,
          metadata: user.metadata || {},
          appMetadata: user.app_metadata || {},
        }
      };
    } catch (error) {
      // Re-throw UnauthorizedException (for banned user)
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      console.error('Validate user error:', error);
      // Fallback to JWT data
      return {
        user: {
          id: userId,
          email: jwtPayload?.email || null,
          name: jwtPayload?.name || null,
          username: jwtPayload?.username || null,
          profileImage: null,
          createdAt: new Date().toISOString(),
          role: jwtPayload?.role || 'user', // Try to get role from JWT payload
          bio: null,
          location: null,
          website: null,
        }
      };
    }
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    try {
      // Update the user profile using the service key
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      
      // Update the user profile in database
      await this.db.updateUser(userId, updateData);

      // Get the updated profile
      const updatedProfile = await this.db.getUserById(userId);
      
      return {
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedProfile.id,
          email: updatedProfile.email,
          name: updatedProfile.name,
          profileImage: updatedProfile.avatar_url,
        },
      };
    } catch (error) {
      console.error('Profile update error:', error);
      throw new Error('Failed to update profile: ' + error.message);
    }
  }

  async uploadProfileImage(userId: string, file: Express.Multer.File) {
    try {
      // Generate unique file name
      const fileName = `${userId}/${Date.now()}-${file.originalname}`;

      // Upload file to storage service using the correct bucket endpoint
      // The SDK will now call /storage/buckets/profiles/upload which we just created
      const uploadResult = await /* TODO: use StorageService */ this.db.uploadFile(
        'profiles', // This is the virtual bucket name
        file.buffer,
        fileName,
        {
          contentType: file.mimetype,
          metadata: {
            userId,
            originalName: file.originalname,
          },
        }
      );

      // The upload result is a StorageFile object with a url property
      console.log('Profile image uploaded successfully');
      console.log('Upload result:', uploadResult);

      // The SDK returns a StorageFile object with a url property
      const publicUrl = uploadResult.url;

      if (!publicUrl) {
        throw new Error('No URL returned from storage upload');
      }

      console.log('Public URL:', publicUrl);

      // Update the user's avatar_url in database
      try {
        await this.db.updateUser(userId, {
          avatar_url: publicUrl,
        });
        console.log('Updated user avatar_url in database');
      } catch (updateError) {
        console.error('Failed to update avatar_url in database:', updateError);
        // Continue anyway since the upload succeeded
      }

      return {
        success: true,
        profileImage: publicUrl,
        fileName,
      };
    } catch (error) {
      console.error('Profile image upload error:', error);
      throw new Error('Failed to upload profile image: ' + error.message);
    }
  }

  // ============================================
  // Social Authentication Methods
  // NOTE: Social auth is now handled by databaseSocialAuthService
  // using database's tenantAuth module
  // ============================================

  /**
   * Get list of available social providers
   * NOTE: This method is deprecated. Use databaseSocialAuthService.getProviders() instead
   */
  async getSocialProviders(): Promise<GetSocialProvidersResponseDto> {
    this.logger.debug('Getting available social providers (deprecated method)');

    // Simplified - just return available providers
    const providers: SocialProviderConfigDto[] = [
      {
        provider: SocialProvider.GOOGLE,
        enabled: true,
        displayName: 'Sign in with Google',
        iconUrl: 'https://www.google.com/favicon.ico',
        scopes: ['openid', 'profile', 'email'],
      },
      {
        provider: SocialProvider.GITHUB,
        enabled: true,
        displayName: 'Sign in with GitHub',
        iconUrl: 'https://github.com/favicon.ico',
        scopes: ['read:user', 'user:email'],
      },
    ];

    return {
      providers,
      total: providers.length,
    };
  }

  /**
   * Initialize social authentication flow
   * NOTE: This method is deprecated. Use databaseSocialAuthService.getOAuthUrl() instead
   */
  async initSocialAuth(dto: SocialAuthInitDto): Promise<{ authorizationUrl: string; state: string }> {
    this.logger.debug(`Initializing social auth for provider: ${dto.provider} (deprecated method)`);
    throw new BadRequestException('This method is deprecated. Use /auth/social/:provider/url endpoint instead');
  }

  /**
   * Handle OAuth callback
   * NOTE: This method is deprecated. Use databaseSocialAuthService.handleOAuthCallback() instead
   */
  async handleSocialCallback(dto: SocialAuthCallbackDto): Promise<SocialAuthResponseDto> {
    this.logger.debug(`Handling social callback for provider: ${dto.provider} (deprecated method)`);
    throw new BadRequestException('This method is deprecated. OAuth callback is handled by database tenantAuth');
  }

  /**
   * Authenticate user with social provider
   * NOTE: This will be used by databaseSocialAuthService after OAuth callback
   */
  async socialAuth(dto: SocialAuthDto): Promise<SocialAuthResponseDto> {
    this.logger.debug(`Social authentication for provider: ${dto.provider}`);

    const profile = dto.userData;

    if (!profile || !profile.email) {
      throw new BadRequestException('Email is required from social provider');
    }

    try {
      // Try to find existing user by email
      const existingUsers = await /* TODO: use AuthService */ this.db.client.auth.searchUsers(profile.email);

      let user: any;
      let isNewUser = false;

      if (existingUsers && existingUsers.users && existingUsers.users.length > 0) {
        // User exists, update linked accounts
        user = existingUsers.users[0];
        this.logger.log(`Existing user found: ${user.id}`);

        // Update user metadata to include linked social account
        const linkedAccounts = user.metadata?.linked_accounts || [];
        const existingLink = linkedAccounts.find((acc: any) => acc.provider === dto.provider);

        if (!existingLink) {
          linkedAccounts.push({
            provider: dto.provider,
            providerId: profile.id,
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            linkedAt: new Date().toISOString(),
          });

          await this.db.updateUser(user.id, {
            metadata: {
              ...user.metadata,
              linked_accounts: linkedAccounts,
            },
          });

          this.logger.log(`Linked ${dto.provider} account to user: ${user.id}`);
        }
      } else {
        // Create new user
        isNewUser = true;
        this.logger.log(`Creating new user from ${dto.provider} profile`);

        // ✅ Get role from DTO or default to 'client' (will be stored in direct column)
        const userRole = dto.role || 'client';

        const registerResponse = await /* TODO: use AuthService */ this.db.signUp(
          profile.email,
          // Generate random password for social auth users
          Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16),
          profile.name || profile.email.split('@')[0],
          {
            avatar_url: profile.avatarUrl,
            linked_accounts: [{
              provider: dto.provider,
              providerId: profile.id,
              email: profile.email,
              name: profile.name,
              avatarUrl: profile.avatarUrl,
              linkedAt: new Date().toISOString(),
            }],
            social_auth: true,
            primary_provider: dto.provider,
          },
          userRole // ✅ Pass role as 5th parameter (direct column), NOT in metadata
        );

        user = registerResponse.user;
        this.logger.log(`New user created via ${dto.provider}: ${user.id}`);
      }

      // Generate JWT token
      const token = this.generateToken(user);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || profile.name,
          avatarUrl: user.avatar_url || profile.avatarUrl,
          provider: dto.provider,
          role: user.role || 'client', // ✅ Read from direct role column, NOT from metadata
        },
        access_token: token,
        message: isNewUser ? 'Account created successfully' : 'Signed in successfully',
        metadata: {
          isNewUser,
          provider: dto.provider,
        },
      };
    } catch (error) {
      this.logger.error(`Social auth error for ${dto.provider}:`, error);

      if (error.response?.status === 409) {
        throw new ConflictException('An account with this email already exists');
      }

      throw new BadRequestException('Social authentication failed: ' + error.message);
    }
  }

  /**
   * Link social account to existing user
   * NOTE: This method is deprecated. Linking is now handled automatically during OAuth flow
   */
  async linkSocialAccount(userId: string, dto: LinkSocialAccountDto): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Linking ${dto.provider} account to user: ${userId} (deprecated method)`);
    throw new BadRequestException('This method is deprecated. Account linking happens automatically during OAuth login');
  }

  /**
   * Unlink social account from user
   */
  async unlinkSocialAccount(userId: string, dto: UnlinkSocialAccountDto): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Unlinking ${dto.provider} account from user: ${userId}`);

    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const linkedAccounts = user.metadata?.linked_accounts || [];
    const filteredAccounts = linkedAccounts.filter((acc: any) => acc.provider !== dto.provider);

    if (filteredAccounts.length === linkedAccounts.length) {
      throw new BadRequestException(`No ${dto.provider} account is linked`);
    }

    // Check if user has password or other linked accounts
    const isSocialAuthUser = user.metadata?.social_auth === true;
    if (isSocialAuthUser && filteredAccounts.length === 0) {
      throw new BadRequestException(
        'Cannot unlink the only social account. Please set a password first or link another account.'
      );
    }

    await this.db.updateUser(userId, {
      metadata: {
        ...user.metadata,
        linked_accounts: filteredAccounts,
      },
    });

    this.logger.log(`Unlinked ${dto.provider} account from user: ${userId}`);

    return {
      success: true,
      message: `${dto.provider} account unlinked successfully`,
    };
  }

  /**
   * Get linked social accounts for user
   */
  async getLinkedAccounts(userId: string): Promise<GetLinkedAccountsResponseDto> {
    this.logger.debug(`Getting linked accounts for user: ${userId}`);

    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const linkedAccounts = user.metadata?.linked_accounts || [];

    const accounts: LinkedAccountDto[] = linkedAccounts.map((acc: any) => ({
      provider: acc.provider,
      providerId: acc.providerId,
      email: acc.email,
      name: acc.name,
      avatarUrl: acc.avatarUrl,
      linkedAt: acc.linkedAt,
      metadata: acc.metadata,
    }));

    return {
      accounts,
      total: accounts.length,
    };
  }

  /**
   * Configure social provider (admin only)
   * NOTE: This method is deprecated. OAuth configuration is now handled in database dashboard
   */
  async configureSocialProvider(dto: ConfigureSocialProviderDto): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Configuring social provider: ${dto.provider} (deprecated method)`);

    // OAuth providers are now configured in database dashboard
    // This method is kept for backward compatibility but returns success

    this.logger.log(`Social provider ${dto.provider} configuration (now managed in database)`);

    return {
      success: true,
      message: `${dto.provider} provider is configured in database dashboard`,
    };
  }

  // ============================================
  // Password Reset Methods
  // ============================================

  /**
   * Send password reset email
   * @param email - User email address
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Password reset requested for email: ${email}`);

      // Get frontend URL from environment or use default
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5177';

      // Use database to send password reset email
      await this.db.resetPasswordForEmail(email, frontendUrl);

      return {
        message: 'If an account with that email exists, we have sent password reset instructions.',
      };
    } catch (error) {
      this.logger.error('Forgot password error:', error);
      // Don't reveal if the email exists or not for security
      return {
        message: 'If an account with that email exists, we have sent password reset instructions.',
      };
    }
  }

  /**
   * Reset password with token
   * @param token - Password reset token
   * @param newPassword - New password
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      this.logger.log('Processing password reset with token');

      // Use database to reset password
      await this.db.resetPassword({ token, newPassword });

      return {
        message: 'Password has been reset successfully. You can now login with your new password.',
      };
    } catch (error) {
      this.logger.error('Reset password error:', error);

      if (error.message?.includes('expired')) {
        throw new BadRequestException('Password reset link has expired. Please request a new one.');
      }

      if (error.message?.includes('invalid')) {
        throw new BadRequestException('Invalid password reset link. Please request a new one.');
      }

      throw new BadRequestException('Failed to reset password. Please try again or request a new reset link.');
    }
  }

  // ============================================
  // OAUTH METHODS (via database - like Deskive)
  // ============================================

  /**
   * Generate GitHub OAuth authorization URL using database
   */
  async getGitHubAuthUrl(frontendUrl: string): Promise<string> {
    try {
      // Ensure the redirect URL includes the callback path
      const baseUrl = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5176';
      const redirectUrl = baseUrl.endsWith('/auth/callback') ? baseUrl : `${baseUrl}/auth/callback`;
      return await /* TODO: use AuthService */ this.db.authClient.auth.getOAuthUrl('github', redirectUrl);
    } catch (error) {
      this.logger.error('Failed to get GitHub OAuth URL:', error);
      throw new BadRequestException('GitHub OAuth is not available');
    }
  }

  /**
   * Generate Google OAuth authorization URL using database
   */
  async getGoogleAuthUrl(frontendUrl: string): Promise<string> {
    try {
      // Ensure the redirect URL includes the callback path
      const baseUrl = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5176';
      const redirectUrl = baseUrl.endsWith('/auth/callback') ? baseUrl : `${baseUrl}/auth/callback`;
      return await /* TODO: use AuthService */ this.db.authClient.auth.getOAuthUrl('google', redirectUrl);
    } catch (error) {
      this.logger.error('Failed to get Google OAuth URL:', error);
      throw new BadRequestException('Google OAuth is not available');
    }
  }

  /**
   * Process OAuth token from database
   * This is called by frontend after receiving database token from OAuth redirect
   *
   * database's job: Create/authenticate user in database database, return tokens and user info
   * Team@Once's job: Generate our own JWT for API authentication
   *
   * THREE SCENARIOS:
   * 1. Existing user with role → return tokens (needsRoleSelection: false)
   * 2. New user with signupRole provided → set role and return tokens (needsRoleSelection: false)
   * 3. New user without role → return needsRoleSelection: true (user must select role)
   */
  async exchangedatabaseToken(authToken: string, userId: string, email: string, signupRole?: string) {
    try {
      this.logger.log(`Processing OAuth for user: ${email}, signupRole: ${signupRole || 'none'}`);

      // Get user profile from database
      let name = email.split('@')[0];
      let avatarUrl = null;
      let userProfile: any = null;

      try {
        userProfile = await this.db.getUserById(userId);
        if (userProfile) {
          const metadata = userProfile.metadata || {};
          name = metadata.name || userProfile.name || (userProfile as any).fullName || name;
          avatarUrl = userProfile.avatar_url;
          this.logger.log(`Fetched user profile: ${JSON.stringify({ id: userId, role: userProfile.role, email: userProfile.email })}`);
        }
      } catch (e) {
        this.logger.warn('Could not fetch user profile for OAuth user:', e);
      }

      // Check if user has companies (means they're an existing user who went through onboarding)
      let userCompanies = [];
      try {
        const companiesResult = await /* TODO: replace client call */ this.db.client.query
          .from('developer_companies')
          .select('id')
          .where('owner_id', userId)
          .execute();
        userCompanies = companiesResult.data || [];
        this.logger.log(`User has ${userCompanies.length} companies`);
      } catch (e) {
        this.logger.warn('Could not fetch user companies:', e);
      }

      // Log current user role for debugging
      this.logger.log(`User profile role: ${userProfile?.role || 'NO ROLE'}`);
      this.logger.log(`User companies count: ${userCompanies.length}`);

      // ✅ SCENARIO 1: User has valid role (client, seller, or admin)
      const validRoles = ['client', 'seller', 'admin', 'super_admin'];
      if (userProfile?.role && validRoles.includes(userProfile.role)) {
        this.logger.log(`User has valid role: ${userProfile.role}`);

        const user = {
          id: userId,
          email: email,
          name: name,
          role: userProfile.role,
        };
        const token = this.generateToken(user);
        const refreshToken = this.jwtService.sign({ sub: userId, email }, { expiresIn: '30d' });

        return {
          needsRoleSelection: false,
          isNewUser: false,
          accessToken: token,
          refreshToken: refreshToken,
          user: {
            id: userId,
            email: email,
            name: name,
            avatarUrl: avatarUrl,
            role: userProfile.role,
          },
        };
      }

      // ✅ SCENARIO 2: User needs role selection (no valid role)
      this.logger.log(`User needs role selection (current role: ${userProfile?.role || 'none'})`);

      // Generate temporary token (10 minutes) for role selection
      const tempToken = this.jwtService.sign(
        {
          sub: userId,
          email,
          temp: true
        },
        { expiresIn: '10m' }
      );

      return {
        needsRoleSelection: true,
        isNewUser: true,
        tempToken: tempToken,
        user: {
          id: userId,
          email: email,
          name: name,
          avatarUrl: avatarUrl,
          // ✅ No role yet - user must select
        },
      };
    } catch (error) {
      this.logger.error('Failed to process OAuth token:', error);
      throw new BadRequestException('OAuth processing failed');
    }
  }

  /**
   * Complete OAuth signup by setting user role
   * Called when new social auth user selects their role
   */
  async completeSocialSignup(userId: string, role: 'client' | 'seller') {
    try {
      this.logger.log(`Completing social signup for user: ${userId}, role: ${role}`);

      // Validate role
      if (!role || (role !== 'client' && role !== 'seller')) {
        throw new BadRequestException('Invalid role. Must be "client" or "seller"');
      }

      // Get user profile
      const userProfile = await this.db.getUserById(userId);
      if (!userProfile) {
        throw new NotFoundException('User not found');
      }

      const metadata = userProfile.metadata || {};
      const name = userProfile.name || (userProfile.email ? userProfile.email.split('@')[0] : 'User');
      const avatarUrl = userProfile.avatar_url;

      // ✅ Update user with role in direct column and initialize metadata
      await this.db.updateUser(userId, {
        role: role, // ✅ Set role in direct column, NOT in metadata
        metadata: {
          ...metadata,
          learning_level: 'beginner',
          xp_points: 0,
          current_streak: 0,
          longest_streak: 0,
          total_study_time: 0,
          preferred_language: 'en',
          timezone: 'UTC',
          learning_goals: [],
          interests: [],
          skills: {},
          achievements: [],
          settings: {
            notifications_enabled: true,
            daily_reminder_time: '09:00',
            weekly_goal_hours: 5,
          }
        }
      });

      // Generate proper JWT tokens
      const user = {
        id: userId,
        email: userProfile.email,
        name: name,
        role: role, // ✅ Use direct role, NOT from metadata
      };
      const token = this.generateToken(user);
      const refreshToken = this.jwtService.sign({ sub: userId, email: userProfile.email }, { expiresIn: '30d' });

      this.logger.log(`Social signup completed for user: ${userId}`);

      return {
        success: true,
        accessToken: token,
        refreshToken: refreshToken,
        user: {
          id: userId,
          email: userProfile.email,
          name: name,
          avatarUrl: avatarUrl,
          role: role, // ✅ Direct role, NOT from metadata
        },
      };
    } catch (error) {
      this.logger.error('Failed to complete social signup:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to complete signup: ' + error.message);
    }
  }
}