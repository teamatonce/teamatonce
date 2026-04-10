import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../../notifications/dto';
import { SchedulerService } from '../scheduler.service';
import { TeamAtOnceGateway } from '../../../websocket/teamatonce.gateway';
import { LiveKitVideoService } from '../../teamatonce/communication/livekit-video.service';
import { RecordingStatus } from '../../teamatonce/communication/dto/recording.dto';

@Injectable()
export class RecordingProcessorJob {
  private readonly logger = new Logger(RecordingProcessorJob.name);
  private isRunning = false;

  // Timeout thresholds
  private readonly PROCESSING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly db: DatabaseService,
    private readonly LiveKitVideoService: LiveKitVideoService,
    private readonly notificationsService: NotificationsService,
    private readonly schedulerService: SchedulerService,
    private readonly gateway: TeamAtOnceGateway,
  ) {}

  // Legacy alias used throughout the file - points at the LiveKit service
  private get dbVideoService(): LiveKitVideoService {
    return this.LiveKitVideoService;
  }

  /**
   * Process recordings that are in 'processing' status
   * Checks database API for completion and updates database
   * Runs every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleRecordingProcessing(): Promise<void> {
    // Prevent overlapping executions
    if (this.isRunning) {
      this.logger.debug('Recording processor job is already running, skipping');
      return;
    }

    this.isRunning = true;
    const jobName = 'RecordingProcessorJob';

    try {
      this.schedulerService.logJobStart(jobName);

      let processedCount = 0;

      // Find all recordings with status='processing'
      const recordings = await this.db.findMany('video_session_recordings', {
        status: RecordingStatus.PROCESSING,
      });

      for (const recording of recordings) {
        try {
          await this.processRecording(recording);
          processedCount++;
        } catch (error) {
          this.logger.error(`Error processing recording ${recording.id}:`, error);
        }
      }

      this.schedulerService.logJobComplete(jobName, processedCount);
    } catch (error) {
      this.schedulerService.logJobError(jobName, error as Error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single recording
   */
  private async processRecording(recording: any): Promise<void> {
    const recordingId = recording.id;
    const egressId = recording.database_recording_id;

    // Check for timeout
    const completedAt = new Date(recording.completed_at || recording.created_at);
    const now = new Date();
    const timeSinceStop = now.getTime() - completedAt.getTime();

    if (timeSinceStop > this.PROCESSING_TIMEOUT_MS) {
      this.logger.warn(`Recording ${recordingId} timed out after ${timeSinceStop}ms`);
      await this.markRecordingFailed(recordingId, 'Processing timeout');
      return;
    }

    // Get video session for notification info
    const session = await this.db.findOne('video_sessions', {
      id: recording.video_session_id,
    });

    if (!session) {
      this.logger.error(`Session not found for recording ${recordingId}`);
      await this.markRecordingFailed(recordingId, 'Session not found');
      return;
    }

    let recordingUrl: string | null = null;
    let fileSize = 0;
    let databaseNotFound = false;

    try {
      // Query database API for recording status using egress ID
      this.logger.log(`Checking recording ${recordingId} (egress: ${egressId})`);
      const livekitRecording = await this.dbVideoService.getRecordingByEgressId(egressId);

      if (livekitRecording) {
        // Check multiple possible URL field names
        recordingUrl = livekitRecording.fileUrl || livekitRecording.url || livekitRecording.recordingUrl || null;
        fileSize = livekitRecording.fileSize || livekitRecording.size || 0;

        // Log the status for debugging
        this.logger.log(`database recording status: ${livekitRecording.status}, fileUrl: ${recordingUrl || 'null'}`);

        // If status is completed but no URL, it might be a storage issue
        if (livekitRecording.status === 'completed' && !recordingUrl) {
          const createdAt = new Date(livekitRecording.created_at);
          const minutesPassed = (now.getTime() - createdAt.getTime()) / (1000 * 60);

          // If it's been more than 5 minutes with completed status but no URL, mark as failed
          if (minutesPassed > 5) {
            this.logger.warn(`Recording ${recordingId} completed but no file URL after ${minutesPassed.toFixed(1)} mins`);
            await this.markRecordingFailed(recordingId, 'Recording completed but file URL not available');
            return;
          }
        }
      }
    } catch (error: any) {
      // Check if it's a 404 error - recording doesn't exist in database
      if (error.response?.status === 404 || error.message?.includes('404')) {
        databaseNotFound = true;
        this.logger.warn(`Recording ${recordingId} not found in database (404)`);
      } else {
        this.logger.debug(`Failed to get recording from database: ${error.message}`);
      }
    }

    // If database returned 404, check how old this recording is
    if (databaseNotFound) {
      const createdAt = new Date(recording.created_at);
      const minutesPassed = (now.getTime() - createdAt.getTime()) / (1000 * 60);

      // If recording is older than 10 minutes and not found in database, mark as failed
      if (minutesPassed > 10) {
        this.logger.warn(`Recording ${recordingId} not found in database after ${minutesPassed.toFixed(1)} mins, marking as failed`);
        await this.markRecordingFailed(recordingId, 'Recording not found in database');
        return;
      }
    }

    // Check if we have a URL now
    if (!recordingUrl) {
      const minutesPassed = (now.getTime() - completedAt.getTime()) / (1000 * 60);
      this.logger.debug(`Recording ${recordingId} still processing (no URL yet, ${minutesPassed.toFixed(1)} mins elapsed)`);
      return;
    }

    // Recording is ready!
    this.logger.log(`Recording ${recordingId} is complete! URL: ${recordingUrl}, Size: ${fileSize}`);
    await this.completeRecording(recording, session, { url: recordingUrl, size: fileSize });
  }

  /**
   * Mark recording as completed and notify users
   */
  private async completeRecording(
    recording: any,
    session: any,
    recordingFile: any,
  ): Promise<void> {
    const recordingId = recording.id;

    // Update recording in database
    await this.db.update('video_session_recordings', recordingId, {
      status: RecordingStatus.COMPLETED,
      recording_url: recordingFile.url,
      file_size_bytes: recordingFile.size || null,
      updated_at: new Date().toISOString(),
    });

    // Also update the video session with the recording URL (for backwards compatibility)
    await this.db.update('video_sessions', session.id, {
      recording_url: recordingFile.url,
      recording_id: recordingId,
      updated_at: new Date().toISOString(),
    });

    this.logger.log(`Recording ${recordingId} completed with URL: ${recordingFile.url}`);

    // Add recording to project_files table
    await this.createProjectFile(recording, session, recordingFile);

    // Send WebSocket notification
    this.gateway.sendToProject(session.project_id, 'recording:completed', {
      sessionId: session.id,
      recordingId,
      recording_url: recordingFile.url,
      duration_seconds: recording.duration_seconds,
      timestamp: new Date().toISOString(),
    });

    // Send notification to host
    await this.notifyHost(recording, session, recordingFile.url);
  }

  /**
   * Create a file entry in project_files for the recording
   */
  private async createProjectFile(
    recording: any,
    session: any,
    recordingFile: any,
  ): Promise<void> {
    try {
      const roomName = session.room_name || 'Video Call';
      const formattedDate = new Date(recording.started_at || recording.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const fileName = `${roomName} - ${formattedDate}.mp4`;
      const storagePath = `projects/${session.project_id}/recordings/${recording.id}.mp4`;

      const fileData = {
        project_id: session.project_id,
        milestone_id: null,
        file_name: fileName,
        file_path: storagePath,
        file_url: recording.url,
        file_size: recording.size || 0,
        mime_type: 'video/mp4',
        file_type: 'video',
        uploaded_by: session.host_id,
        description: `Recording of video call: ${roomName}`,
        tags: JSON.stringify(['recording', 'video-call']),
        version: 1,
        is_deliverable: false,
        deliverable_index: null,
        thumbnail_url: null,
        is_public: false,
        shared_with: JSON.stringify([]),
        metadata: JSON.stringify({
          source: 'video-call-recording',
          video_session_id: session.id,
          recording_id: recording.id,
          duration_seconds: recording.duration_seconds,
          session_type: session.session_type,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createdFile = await this.db.insert('project_files', fileData);
      this.logger.log(`Created project file entry: ${createdFile?.id || 'unknown'} for recording ${recording.id}`);
    } catch (error) {
      this.logger.error(`Failed to create project file entry for recording ${recording.id}:`, error);
      // Don't throw - recording is still complete, file entry is secondary
    }
  }

  /**
   * Send notification to the host that recording is ready
   */
  private async notifyHost(
    recording: any,
    session: any,
    recordingUrl: string,
  ): Promise<void> {
    const hostId = session.host_id;

    // Get project info for notification URL
    const project = await this.db.findOne('projects', { id: session.project_id });

    // Determine company ID for URL
    const companyId = project?.company_id || project?.assigned_company_id;

    const durationFormatted = this.formatDuration(recording.duration_seconds);
    const notificationTitle = `🎥 Recording Ready`;
    const notificationMessage = `Your video call recording "${session.room_name}" (${durationFormatted}) is now ready for download.`;

    try {
      // Send WebSocket notification to host
      this.gateway.sendToUser(hostId, 'recording-ready', {
        recordingId: recording.id,
        sessionId: session.id,
        title: notificationTitle,
        message: notificationMessage,
        recording_url: recordingUrl,
        duration_seconds: recording.duration_seconds,
        timestamp: new Date().toISOString(),
      });

      // Send push notification
      await this.notificationsService.sendNotification({
        user_id: hostId,
        type: NotificationType.OTHER,
        title: notificationTitle,
        message: notificationMessage,
        priority: NotificationPriority.NORMAL,
        action_url: companyId
          ? `/company/${companyId}/project/${session.project_id}/files`
          : `/project/${session.project_id}/files`,
        data: {
          recordingId: recording.id,
          sessionId: session.id,
          projectId: session.project_id,
          companyId: companyId,
          recording_url: recordingUrl,
          duration_seconds: recording.duration_seconds,
        },
        send_push: true,
      });

      this.logger.log(`Sent recording ready notification to host ${hostId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification to host ${hostId}:`, error);
    }
  }

  /**
   * Mark recording as failed
   */
  private async markRecordingFailed(recordingId: string, reason: string): Promise<void> {
    await this.db.update('video_session_recordings', recordingId, {
      status: RecordingStatus.FAILED,
      metadata: JSON.stringify({
        ...this.safeJsonParse((await this.db.findOne('video_session_recordings', { id: recordingId }))?.metadata),
        failure_reason: reason,
      }),
      updated_at: new Date().toISOString(),
    });

    this.logger.log(`Recording ${recordingId} marked as failed: ${reason}`);
  }

  /**
   * Format duration in seconds to human readable
   */
  private formatDuration(seconds: number): string {
    if (!seconds || seconds < 60) {
      return `${seconds || 0} seconds`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours} hours`;
  }

  /**
   * Safe JSON parser
   */
  private safeJsonParse(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
