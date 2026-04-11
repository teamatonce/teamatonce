import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SsoController } from './sso/sso.controller';
import { SsoRegistryService } from './sso/sso-registry.service';
import { MagicLinkService } from './sso/magic-link.service';
import { EmailService } from '../../services/email.service';

/**
 * Auth module.
 *
 * Existing:
 * - AuthController + AuthService — local email/password + OAuth flows
 * - JwtAuthGuard — standard JWT middleware
 * - Passport strategies under ./strategies/ for Google + GitHub
 *
 * NEW (pluggable SSO layer — see issue #31):
 * - SsoRegistryService — reads AUTH_PROVIDERS from .env and returns
 *   the active list to the frontend
 * - MagicLinkService — email-based passwordless sign-in
 * - SsoController — exposes /auth/providers + /auth/magic-link/*
 *
 * EmailService is imported from ../../services/email.service — it's
 * the existing centralized email service. Once the email adapter
 * PR lands, this import can be swapped for the pluggable façade.
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SsoController],
  providers: [
    AuthService,
    JwtAuthGuard,
    SsoRegistryService,
    MagicLinkService,
    EmailService,
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard, SsoRegistryService],
})
export class AuthModule {}
