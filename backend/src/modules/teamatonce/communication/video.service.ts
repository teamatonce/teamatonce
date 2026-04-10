import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TeamAtOnceGateway } from '../../../websocket/teamatonce.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationPriority, NotificationType } from '../../notifications/dto/create-notification.dto';
import { ProjectAccessService } from '../project/project-access.service';
import { LiveKitVideoService } from './livekit-video.service';
import {
  CreateVideoSessionDto,
  UpdateVideoSessionDto,
  JoinVideoSessionDto,
  UpdateParticipantsDto,
  VideoSessionType,
  VideoSessionStatus,
} from './dto/video.dto';
import {
  StartRecordingDto,
  RecordingResponse,
  RecordingStatus,
  StopRecordingResponse,
} from './dto/recording.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: TeamAtOnceGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ProjectAccessService))
    private readonly projectAccessService: ProjectAccessService,
    @Inject(forwardRef(() => LiveKitVideoService))
    private readonly LiveKitVideoService: LiveKitVideoService,
  ) {}

  // Legacy alias used throughout the file - points at the LiveKit service
  private get dbVideoService(): LiveKitVideoService {
    return this.LiveKitVideoService;
  }

  /**
   * Create a new video session
   * Integrates with database LiveKit-based video conferencing
   */
  async createVideoSession(
    projectId: string,
    hostId: string,
    dto: CreateVideoSessionDto,
  ) {
    try {
      // Generate a unique room name for LiveKit
      const sanitizedName = (dto.roomName || 'Video Call')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const uniqueRoomName = `${sanitizedName}_${projectId}_${Date.now()}`;

      this.logger.log(`Creating video session: ${uniqueRoomName}`);

      // Try to create LiveKit room via database
      let livekitRoom: any = null;
      let liveKitRoomId: string | null = null;

      if (this.dbVideoService.isAvailable()) {
        try {
          livekitRoom = await this.dbVideoService.createRoom({
            roomName: uniqueRoomName,
            maxParticipants: 50,
            recordingEnabled: false,
          });

          liveKitRoomId = livekitRoom?.roomId || livekitRoom?.id || null;
          this.logger.log(`LiveKit room created: ${liveKitRoomId}`);
        } catch (liveKitError) {
          this.logger.warn(`LiveKit room creation failed, using fallback: ${liveKitError.message}`);
          // Continue without LiveKit - fallback to database-only session
        }
      } else {
        this.logger.warn('database video service not available, creating session without LiveKit');
      }

      // Create video session record in database
      const sessionData = {
        project_id: projectId,
        room_id: uniqueRoomName,
        room_name: dto.roomName,
        session_type: dto.sessionType || VideoSessionType.MEETING,
        scheduled_at: dto.scheduledAt
          ? new Date(dto.scheduledAt).toISOString()
          : null,
        started_at: dto.scheduledAt ? null : new Date().toISOString(),
        ended_at: null,
        duration_minutes: null,
        host_id: hostId,
        participants: JSON.stringify([]),
        recording_url: null,
        recording_id: null,
        meeting_notes: null,
        agenda: dto.agenda || null,
        status: dto.scheduledAt ? VideoSessionStatus.SCHEDULED : VideoSessionStatus.ACTIVE,
        metadata: JSON.stringify({
          livekit_room_id: liveKitRoomId,
          livekit_room_name: uniqueRoomName,
          join_url: livekitRoom?.joinUrl || null,
          embed_url: livekitRoom?.embedUrl || null,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const session = await this.db.insert('video_sessions', sessionData);
      const parsedSession = this.parseVideoSessionJson(session);

      // AUTO-INVITE: Notify ALL project members about new video session
      // Get all project members
      const memberIds = await this.projectAccessService.getProjectMemberIds(projectId);
      const otherMembers = memberIds.filter((id) => id !== hostId);

      // Send WebSocket notification to project
      this.gateway.sendToProject(projectId, 'video-session-created', {
        session: parsedSession,
        hostId,
        timestamp: new Date().toISOString(),
      });

      // Send in-app notifications to all project members (except host)
      if (otherMembers.length > 0) {
        await this.notificationsService.sendNotification({
          user_ids: otherMembers,
          type: NotificationType.OTHER,
          title: 'Video Call Started',
          message: `A new video call "${dto.roomName}" has been started. Click to join.`,
          action_url: `/project/${projectId}/video/${session.id}`,
          data: {
            projectId,
            sessionId: session.id,
            roomId: uniqueRoomName,
            sessionType: dto.sessionType,
          },
          priority: NotificationPriority.HIGH,
        });
      }

      return {
        ...parsedSession,
        livekit_room: livekitRoom,
      };
    } catch (error) {
      this.logger.error(`Error creating video session: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create video session');
    }
  }

  /**
   * Join a video session
   * Returns connection details for database video (LiveKit)
   */
  async joinVideoSession(sessionId: string, dto: JoinVideoSessionDto) {
    const session = await this.getVideoSession(sessionId);

    // Update session status if it's scheduled
    if (session.status === VideoSessionStatus.SCHEDULED) {
      await this.db.update('video_sessions', sessionId, {
        status: VideoSessionStatus.ACTIVE,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Add participant to session
    const participants = session.participants || [];
    const participantData = {
      userId: dto.userId,
      displayName: dto.displayName,
      joinedAt: new Date().toISOString(),
      leftAt: null,
    };

    // Check if user is already in the session
    const existingParticipantIndex = participants.findIndex(
      (p: any) => p.userId === dto.userId,
    );

    if (existingParticipantIndex >= 0) {
      // Update existing participant
      participants[existingParticipantIndex] = participantData;
    } else {
      // Add new participant
      participants.push(participantData);
    }

    await this.db.update('video_sessions', sessionId, {
      participants: JSON.stringify(participants),
      updated_at: new Date().toISOString(),
    });

    // Notify other participants
    this.gateway.sendToProject(session.project_id, 'participant-joined', {
      sessionId,
      participant: participantData,
      timestamp: new Date().toISOString(),
    });

    // Generate LiveKit token for the participant
    let connectionDetails: any = null;
    const roomName = session.metadata?.livekit_room_name || session.room_id;

    if (this.dbVideoService.isAvailable()) {
      try {
        this.logger.log(`Generating LiveKit token for ${dto.userId} in room ${roomName}`);

        const tokenResponse = await this.dbVideoService.generateToken(
          roomName,
          dto.userId,
          {
            name: dto.displayName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
        );

        connectionDetails = {
          token: tokenResponse.token,
          url: tokenResponse.url,
          roomName: tokenResponse.roomName,
          roomId: session.room_id,
          sessionType: session.session_type,
        };

        this.logger.log(`LiveKit token generated successfully for ${dto.userId}`);
      } catch (tokenError) {
        this.logger.warn(`Failed to generate LiveKit token: ${tokenError.message}`);
        // Fallback to basic connection details without token
        connectionDetails = {
          roomId: session.room_id,
          roomName: session.room_name,
          sessionType: session.session_type,
          token: null,
          url: null,
        };
      }
    } else {
      // database video not available - return basic session details
      connectionDetails = {
        roomId: session.room_id,
        roomName: session.room_name,
        sessionType: session.session_type,
        token: null,
        url: null,
      };
    }

    const updatedSession = await this.getVideoSession(sessionId);

    // Return in format expected by frontend
    return {
      session: updatedSession,
      token: connectionDetails?.token || null,
      roomUrl: connectionDetails?.url || null,
      roomName: connectionDetails?.roomName || session.room_name,
      connectionDetails, // Keep for backwards compatibility
    };
  }

  /**
   * End a video session
   */
  async endVideoSession(sessionId: string, dto?: UpdateVideoSessionDto) {
    const session = await this.getVideoSession(sessionId);

    // Calculate duration
    const startTime = new Date(session.started_at || session.created_at);
    const endTime = new Date();
    const durationMinutes = Math.floor(
      (endTime.getTime() - startTime.getTime()) / 1000 / 60,
    );

    const updateData: any = {
      status: VideoSessionStatus.ENDED,
      ended_at: new Date().toISOString(),
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    };

    if (dto?.recordingUrl) {
      updateData.recording_url = dto.recordingUrl;
    }

    if (dto?.meetingNotes) {
      updateData.meeting_notes = dto.meetingNotes;
    }

    // Update all participants to mark them as left
    const participants = session.participants || [];
    const updatedParticipants = participants.map((p: any) => ({
      ...p,
      leftAt: p.leftAt || new Date().toISOString(),
    }));
    updateData.participants = JSON.stringify(updatedParticipants);

    await this.db.update('video_sessions', sessionId, updateData);

    const endedSession = await this.getVideoSession(sessionId);

    // Notify project members about ended session
    this.gateway.sendToProject(session.project_id, 'video-session-ended', {
      session: endedSession,
      timestamp: new Date().toISOString(),
    });

    return endedSession;
  }

  /**
   * Update video session participants
   */
  async updateParticipants(sessionId: string, dto: UpdateParticipantsDto) {
    await this.getVideoSession(sessionId); // Verify session exists

    await this.db.update('video_sessions', sessionId, {
      participants: JSON.stringify(dto.participants),
      updated_at: new Date().toISOString(),
    });

    return this.getVideoSession(sessionId);
  }

  /**
   * Get recent video sessions for a project
   */
  async getRecentSessions(projectId: string, limit: number = 10) {
    const sessions = await this.db.findMany(
      'video_sessions',
      { project_id: projectId },
      {
        orderBy: 'created_at',
        order: 'desc',
        limit,
      },
    );

    return sessions.map((s) => this.parseVideoSessionJson(s));
  }

  /**
   * Get a specific video session by ID
   */
  async getVideoSession(sessionId: string) {
    const session = await this.db.findOne('video_sessions', {
      id: sessionId,
    });

    if (!session) {
      throw new NotFoundException(
        `Video session with ID ${sessionId} not found`,
      );
    }

    return this.parseVideoSessionJson(session);
  }

  /**
   * Update video session details
   */
  async updateVideoSession(sessionId: string, dto: UpdateVideoSessionDto) {
    await this.getVideoSession(sessionId); // Verify session exists

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.recordingUrl !== undefined) {
      updateData.recording_url = dto.recordingUrl;
    }

    if (dto.meetingNotes !== undefined) {
      updateData.meeting_notes = dto.meetingNotes;
    }

    if (dto.status) {
      updateData.status = dto.status;

      // Update timestamps based on status
      if (dto.status === VideoSessionStatus.ACTIVE && !updateData.started_at) {
        updateData.started_at = new Date().toISOString();
      } else if (dto.status === VideoSessionStatus.ENDED && !updateData.ended_at) {
        updateData.ended_at = new Date().toISOString();
      }
    }

    await this.db.update('video_sessions', sessionId, updateData);
    return this.getVideoSession(sessionId);
  }

  /**
   * Cancel a video session
   */
  async cancelVideoSession(sessionId: string) {
    const session = await this.getVideoSession(sessionId);

    await this.db.update('video_sessions', sessionId, {
      status: VideoSessionStatus.CANCELLED,
      updated_at: new Date().toISOString(),
    });

    // Notify project members
    this.gateway.sendToProject(session.project_id, 'video-session-cancelled', {
      sessionId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Video session cancelled successfully' };
  }

  /**
   * Get active video sessions for a project
   */
  async getActiveSessions(projectId: string) {
    const sessions = await this.db.findMany(
      'video_sessions',
      {
        project_id: projectId,
        status: VideoSessionStatus.ACTIVE,
      },
      {
        orderBy: 'started_at',
        order: 'desc',
      },
    );

    return sessions.map((s) => this.parseVideoSessionJson(s));
  }

  // ============================================
  // RECORDING METHODS
  // ============================================

  /**
   * Start recording a video session (host only)
   */
  async startRecording(
    sessionId: string,
    userId: string,
    dto?: StartRecordingDto,
  ): Promise<RecordingResponse> {
    const session = await this.getVideoSession(sessionId);

    // Only host can start recording
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can start recording');
    }

    // Check if already recording
    if (session.is_recording) {
      throw new BadRequestException('Recording is already in progress');
    }

    // Get LiveKit room ID from metadata
    const liveKitRoomId = session.metadata?.livekit_room_id || session.room_id;

    // Prepare recording config
    const recordingConfig: any = {
      layout: 'grid',
      outputFormat: 'mp4',
    };

    // For audio-only recordings, use minimal video resolution
    if (dto?.audio_only) {
      recordingConfig.width = 1;
      recordingConfig.height = 1;
      recordingConfig.videoBitrate = 1;
    }

    this.logger.log(`Starting recording for session ${sessionId} with room ${liveKitRoomId}`);

    // Start recording via database
    const recording = await this.dbVideoService.startRecording(
      liveKitRoomId,
      recordingConfig,
    );

    // Store recording in database
    const recordingData = await this.db.insert('video_session_recordings', {
      video_session_id: sessionId,
      project_id: session.project_id,
      database_recording_id: recording.database_recording_id || recording.recordingId,
      status: RecordingStatus.RECORDING,
      started_at: new Date().toISOString(),
      started_by: userId,
      metadata: JSON.stringify({
        audio_only: dto?.audio_only || false,
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update session recording status
    await this.db.update('video_sessions', sessionId, {
      is_recording: true,
      updated_at: new Date().toISOString(),
    });

    // Notify participants that recording has started
    this.gateway.sendToProject(session.project_id, 'recording:started', {
      sessionId,
      recordingId: recordingData.id,
      startedBy: userId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Recording started for session ${sessionId}, recording ID: ${recordingData.id}`);

    return this.parseRecordingJson(recordingData);
  }

  /**
   * Stop recording a video session (host only)
   */
  async stopRecording(
    sessionId: string,
    recordingId: string,
    userId: string,
  ): Promise<StopRecordingResponse> {
    const session = await this.getVideoSession(sessionId);

    // Only host can stop recording
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can stop recording');
    }

    // Get recording from database
    const recording = await this.db.findOne('video_session_recordings', {
      id: recordingId,
      video_session_id: sessionId,
    });

    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    // Get LiveKit room ID
    const liveKitRoomId = session.metadata?.livekit_room_id || session.room_id;

    // Stop recording via database
    await this.dbVideoService.stopRecording(liveKitRoomId, recording.database_recording_id);

    // Calculate duration
    const duration = recording.started_at
      ? Math.floor(
          (new Date().getTime() - new Date(recording.started_at).getTime()) / 1000,
        )
      : 0;

    // Update recording status to processing (background job will finalize)
    await this.db.update('video_session_recordings', recordingId, {
      status: RecordingStatus.PROCESSING,
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      updated_at: new Date().toISOString(),
    });

    // Update session recording status
    await this.db.update('video_sessions', sessionId, {
      is_recording: false,
      updated_at: new Date().toISOString(),
    });

    // Notify participants that recording has stopped
    this.gateway.sendToProject(session.project_id, 'recording:stopped', {
      sessionId,
      recordingId,
      duration_seconds: duration,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Recording stopped for session ${sessionId}, processing in background`);

    return {
      message: 'Recording stopped - processing in background. You will be notified when ready.',
      duration_seconds: duration,
      status: RecordingStatus.PROCESSING,
    };
  }

  /**
   * Get all recordings for a video session
   */
  async getRecordings(sessionId: string): Promise<RecordingResponse[]> {
    // Verify session exists
    await this.getVideoSession(sessionId);

    const recordings = await this.db.findMany(
      'video_session_recordings',
      { video_session_id: sessionId },
      { orderBy: 'created_at', order: 'desc' },
    );

    return recordings.map((r) => this.parseRecordingJson(r));
  }

  /**
   * Get a specific recording by ID
   */
  async getRecording(recordingId: string): Promise<RecordingResponse> {
    const recording = await this.db.findOne('video_session_recordings', {
      id: recordingId,
    });

    if (!recording) {
      throw new NotFoundException(`Recording with ID ${recordingId} not found`);
    }

    return this.parseRecordingJson(recording);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Parse JSON fields in recording records
   */
  private parseRecordingJson(recording: any): RecordingResponse {
    if (!recording) return null;

    return {
      ...recording,
      metadata: this.safeJsonParse(recording.metadata),
    };
  }

  /**
   * Parse JSON fields in video session records
   */
  private parseVideoSessionJson(session: any) {
    if (!session) return null;

    return {
      ...session,
      participants: this.safeJsonParse(session.participants),
      metadata: this.safeJsonParse(session.metadata),
    };
  }

  /**
   * Safe JSON parser
   */
  private safeJsonParse(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
