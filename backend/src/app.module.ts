import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AIModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EdgeFunctionsModule } from './modules/edge-functions/edge-functions.module';
import { WebSocketModule } from './common/gateways/websocket.module';
import { LandingModule } from './modules/landing/landing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BlogModule } from './modules/blog/blog.module';
import { LanguageModule } from './modules/language/language.module';

// Learning OS specific modules
import { CoursesModule } from './modules/courses/courses.module';
import { LearningPathsModule } from './modules/learning-paths/learning-paths.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { ProgressModule } from './modules/progress/progress.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
// import { AiTutorModule } from './modules/ai-tutor/ai-tutor.module';
// import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DiscussionsModule } from './modules/discussions/discussions.module';
import { ContentModule } from './modules/content/content.module';
import { StudyGroupsModule } from './modules/study-groups/study-groups.module';
import { SearchModule } from './modules/search/search.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { DatabaseModule } from './modules/database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { InstructorsModule } from './modules/instructors/instructors.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { PaymentModule } from './modules/payment/payment.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

// Team@Once specific modules
import { TeamAtOnceWebSocketModule } from './websocket/websocket.module';
import { ProjectModule } from './modules/teamatonce/project/project.module';
import { CommunicationModule } from './modules/teamatonce/communication/communication.module';
import { ContractModule } from './modules/teamatonce/contract/contract.module';
import { FeedbackModule } from './modules/teamatonce/feedback/feedback.module';
import { ProjectDefinitionModule } from './modules/teamatonce/project-definition/project-definition.module';
import { TeamModule } from './modules/teamatonce/team/team.module';
import { CompanyModule } from './modules/company/company.module';
import { AnalyticsModule as TeamAtOnceAnalyticsModule } from './modules/teamatonce/analytics/analytics.module';
import { NotesModule } from './modules/teamatonce/notes/notes.module';
import { DeveloperModule } from './modules/teamatonce/developer/developer.module';
import { PublicModule } from './modules/public/public.module';
import { HireRequestModule } from './modules/teamatonce/hire-request/hire-request.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { DataEngineModule } from './modules/data-engine/data-engine.module';
import { QdrantModule } from './modules/qdrant/qdrant.module';
import { QueueModule } from './modules/queue/queue.module';
import { CurrencyModule } from './modules/currency/currency.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    WebSocketModule,
    TeamAtOnceWebSocketModule, // TeamAtOnce real-time communication
    AuthModule,
    UsersModule,
    AIModule,
    NotificationsModule,
    EdgeFunctionsModule,
    LandingModule,
    DashboardModule,
    BlogModule,
    LanguageModule,

    // Learning OS modules
    CoursesModule,
    LearningPathsModule,
    AssessmentsModule,
    ProgressModule,
    CertificatesModule,
    // AiTutorModule, // Temporarily disabled due to compilation errors
    // AnalyticsModule, // Temporarily disabled due to compilation errors
    DiscussionsModule,
    ContentModule,
    StudyGroupsModule,
    SearchModule,
    AchievementsModule,
    DatabaseModule,
    StorageModule,
    AdminModule,
    InstructorsModule,
    EscrowModule,
    PaymentModule,
    WorkspaceModule,

    // Team@Once modules
    ProjectModule,
    CommunicationModule,
    ContractModule,
    FeedbackModule,
    ProjectDefinitionModule,
    TeamModule,
    CompanyModule,
    TeamAtOnceAnalyticsModule,
    NotesModule,
    DeveloperModule,
    PublicModule,
    HireRequestModule,
    SchedulerModule,
    DataEngineModule,

    // Multi-currency support
    CurrencyModule,

    // Infrastructure modules (Global)
    QdrantModule,
    QueueModule,
  ],
  providers: [
    // Global exception filter can be added here if needed
    // {
    //   provide: APP_FILTER,
    //   useClass: GlobalExceptionFilter,
    // },
  ],
})
export class AppModule {}