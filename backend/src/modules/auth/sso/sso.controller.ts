/**
 * SSO public endpoints.
 *
 *   GET  /api/v1/auth/providers
 *     Returns the list of enabled auth providers for this
 *     deployment. The frontend calls this once on page load to
 *     render the login buttons (Google / GitHub / Magic Link /
 *     Email + Password). Deliberately unauthenticated.
 *
 *   POST /api/v1/auth/magic-link/request { email }
 *     Issues a magic-link sign-in email. Returns { success: true }
 *     regardless of whether the email exists (enumeration
 *     protection). In non-production, also returns { debugToken }
 *     so the dev + e2e test can complete the flow without waiting
 *     on real email delivery.
 *
 *   POST /api/v1/auth/magic-link/verify { token }
 *     Verifies the magic-link token, finds or creates the user,
 *     returns a real access token. Frontend redirects to the app
 *     after this.
 */
import {
  Body,
  Controller,
  Get,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SsoRegistryService } from './sso-registry.service';
import { MagicLinkService } from './magic-link.service';
import { AuthService } from '../auth.service';

@ApiTags('auth')
@Controller('auth')
export class SsoController {
  constructor(
    private readonly registry: SsoRegistryService,
    private readonly magicLink: MagicLinkService,
    private readonly authService: AuthService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'List enabled SSO / auth providers for the frontend to render',
  })
  listProviders() {
    return {
      providers: this.registry.getEnabled(),
    };
  }

  @Post('magic-link/request')
  @ApiOperation({ summary: 'Email a magic sign-in link to the user' })
  async requestMagicLink(@Body() body: { email?: string }) {
    if (!this.registry.isEnabled('magic-link')) {
      throw new BadRequestException(
        'Magic link auth is not enabled in this deployment. Add "magic-link" to AUTH_PROVIDERS.',
      );
    }
    if (!body?.email) {
      throw new BadRequestException('email is required');
    }
    return this.magicLink.requestMagicLink(body.email);
  }

  @Post('magic-link/verify')
  @ApiOperation({
    summary: 'Verify a magic-link token and return an access token',
  })
  async verifyMagicLink(@Body() body: { token?: string }) {
    if (!this.registry.isEnabled('magic-link')) {
      throw new BadRequestException(
        'Magic link auth is not enabled in this deployment.',
      );
    }
    if (!body?.token) {
      throw new BadRequestException('token is required');
    }
    const email = this.magicLink.verifyToken(body.token);
    return this.authService.authenticateViaMagicLink(email);
  }
}
