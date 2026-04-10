import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CompanyController } from './company.controller';
import { InvitationPublicController } from './invitation-public.controller';
import { EmailTestController } from './email-test.controller';
import { CompanyService } from './company.service';
import { CompanyMemberService } from './company-member.service';
import { InvitationService } from './invitation.service';
import { ProjectModule } from '../teamatonce/project/project.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '../../services/email.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Company Module
 *
 * Manages developer companies/organizations including:
 * - Company CRUD operations
 * - Team member management
 * - Invitation system for adding members
 * - Company settings and configuration
 * - Statistics and analytics
 * - Workload management
 *
 * This module provides a complete company management system for the Team@Once platform,
 * allowing developers to create companies, invite team members, and manage their organization.
 */
@Module({
  imports: [
    ProjectModule,
    forwardRef(() => NotificationsModule),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRATION', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
  ],
  controllers: [
    CompanyController,
    InvitationPublicController,
    // Only enable in development for testing emails
    ...(process.env.NODE_ENV === 'development' ? [EmailTestController] : []),
  ],
  providers: [
    CompanyService,
    CompanyMemberService,
    InvitationService,
    EmailService,
  ],
  exports: [
    CompanyService,
    CompanyMemberService,
    InvitationService,
  ],
})
export class CompanyModule {}
