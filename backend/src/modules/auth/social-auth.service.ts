/**
 * database Social Authentication Service
 * Uses database AuthClient for OAuth
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

// Social provider type (google, github, facebook, apple)
type SocialProvider = 'google' | 'github' | 'facebook' | 'apple';

@Injectable()
export class databaseSocialAuthService {
  private readonly logger = new Logger(databaseSocialAuthService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get OAuth authorization URL from database
   * Uses: client.auth.getOAuthUrl(provider, redirectUrl)
   */
  async getOAuthUrl(provider: SocialProvider, redirectUrl?: string): Promise<string> {
    try {
      this.logger.log(`Getting OAuth URL for provider: ${provider}, redirectUrl: ${redirectUrl || 'none'}`);

      // Use database's AuthClient method directly
      // Pass redirect URL so database knows where to send user after OAuth
      const url = await /* TODO: use AuthService */ this.db.authClient.auth.getOAuthUrl(provider, redirectUrl);

      this.logger.log(`OAuth URL generated: ${url}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to get OAuth URL for ${provider}:`, error.message);
      throw new BadRequestException(
        `Failed to get OAuth URL: ${error.message}`
      );
    }
  }

  /**
   * Handle OAuth callback from database
   * Uses: client.auth.handleOAuthCallback(provider, code, state)
   */
  async handleOAuthCallback(provider: SocialProvider, code: string, state: string) {
    try {
      this.logger.log(`Handling OAuth callback for ${provider}`);

      // Use database's AuthClient callback handler
      const response = await /* TODO: use AuthService */ this.db.authClient.auth.handleOAuthCallback(
        provider,
        code,
        state
      );

      this.logger.log(`OAuth callback successful for ${provider}, user: ${response.user.email}`);

      // Map database response to Team@Once format
      // ✅ Note: role should be read from response.user.role (direct column)
      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          name: response.user.name || response.user.email.split('@')[0], // Use name if available
          avatar: response.user.avatar_url,
          role: response.user.role || 'client', // ✅ Get from user direct column, NOT from metadata
          timezone: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessToken: response.token,
        refreshToken: response.refreshToken,
        isNewUser: true, // database doesn't provide this info yet
      };
    } catch (error) {
      this.logger.error(`OAuth callback failed for ${provider}:`, error.message);
      throw new BadRequestException(
        `OAuth callback failed: ${error.message}`
      );
    }
  }

  /**
   * Get available social providers from database
   * Uses: client.auth.getSocialProviders()
   */
  async getProviders() {
    try {
      const providers = await /* TODO: use AuthService */ this.db.authClient.auth.getSocialProviders();
      return providers || [];
    } catch (error) {
      this.logger.error('Failed to get providers:', error.message);
      return [];
    }
  }
}
