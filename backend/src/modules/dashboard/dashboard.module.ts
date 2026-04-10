import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthGuard } from '../../common/guards/auth.guard';

// Team@Once modules for real data
import { ProjectModule } from '../teamatonce/project/project.module';
import { AnalyticsModule } from '../teamatonce/analytics/analytics.module';
import { ActivityLoggerModule } from '../activity-logger/activity-logger.module';

// Learning OS modules
import { CoursesModule } from '../courses/courses.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    NotificationsModule,
    // Team@Once real data modules
    forwardRef(() => ProjectModule),
    forwardRef(() => AnalyticsModule),
    ActivityLoggerModule,
    // Learning OS modules
    CoursesModule,
    ProgressModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, AuthGuard],
  exports: [DashboardService]
})
export class DashboardModule {}