import { Module, forwardRef } from '@nestjs/common';
import { TeamAtOnceWebSocketModule } from '../../../websocket/websocket.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ProjectModule } from '../project/project.module';
import { AuthModule } from '../../auth/auth.module';

// Controllers
import { CommunicationController } from './communication.controller';
import { CalendarController } from './calendar.controller';
import { NotesController } from './notes.controller';

// Services
import { MeetingService } from './meeting.service';
import { WhiteboardService } from './whiteboard.service';
import { EventsService } from './events.service';
import { ChatService } from './chat.service';
import { VideoService } from './video.service';
import { LiveKitVideoService } from './livekit-video.service';
import { CalendarService } from './calendar.service';
import { NotesService } from './notes.service';

/**
 * Communication Module
 *
 * Handles all real-time communication features for the Team@Once platform:
 * - Meetings: Schedule and manage team meetings
 * - Whiteboard: Collaborative whiteboard sessions
 * - Calendar Events: Project calendar and event management (auto-assignment)
 * - Chat: Real-time messaging and conversations (auto-assignment)
 * - Video: Video conferencing sessions (auto-invite)
 * - Notes: Project notes with hierarchical structure (project-wide access)
 *
 * All services use:
 * - DatabaseService for database operations
 * - Team@OnceGateway for WebSocket real-time updates
 * - ProjectAccessService for unified access control
 * - Multi-tenant architecture with project-based filtering
 *
 * AUTO-ASSIGNMENT: When a user is added to a project, they automatically
 * get access to all project features (chat, calendar, notes, video).
 */
@Module({
  imports: [
    AuthModule,
    forwardRef(() => TeamAtOnceWebSocketModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => ProjectModule),
  ],
  controllers: [
    CommunicationController,
    CalendarController,
    NotesController,
  ],
  providers: [
    MeetingService,
    WhiteboardService,
    EventsService,
    ChatService,
    VideoService,
    LiveKitVideoService,
    CalendarService,
    NotesService,
  ],
  exports: [
    MeetingService,
    WhiteboardService,
    EventsService,
    ChatService,
    VideoService,
    LiveKitVideoService,
    CalendarService,
    NotesService,
  ],
})
export class CommunicationModule {}
