/**
 * database Video Conferencing Service
 *
 * Wraps the database's video conferencing module (LiveKit-based).
 * Provides room management, token generation, participant management, and recording.
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class databaseVideoService {
  private readonly logger = new Logger(databaseVideoService.name);

  constructor(private readonly db: DatabaseService) {}

  // ============================================
  // Room Management
  // ============================================

  /**
   * Create a new video conference room
   */
  async createRoom(options: {
    roomName: string;
    maxParticipants?: number;
    recordingEnabled?: boolean;
    metadata?: Record<string, any>;
  }): Promise<any> {
    try {
      this.logger.log(`Creating video room: ${options.roomName}`);

      // Use the SDK's video conferencing module
      const roomData = await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.createRoom({
        roomName: options.roomName,
        maxParticipants: options.maxParticipants || 50,
        recordingEnabled: options.recordingEnabled || false,
        ...options,
      } as any);

      this.logger.log(`Room created successfully: ${roomData.roomId || roomData.id}`);

      return roomData;
    } catch (error) {
      this.logger.error(`Failed to create room: ${error.message}`, error.stack);

      // If duplicate room error, the room may have been created
      if (error.message?.includes('duplicate key')) {
        this.logger.warn('Duplicate room detected, room may exist');
      }

      throw error;
    }
  }

  /**
   * Get room details by ID
   */
  async getRoom(roomId: string): Promise<any> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.getRoom(roomId);
    } catch (error) {
      this.logger.error(`Failed to get room ${roomId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * List all rooms with optional filters
   */
  async listRooms(filters?: any): Promise<any[]> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.listRooms(filters);
    } catch (error) {
      this.logger.error(`Failed to list rooms: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update room settings
   */
  async updateRoom(roomId: string, options: any): Promise<any> {
    try {
      this.logger.log(`Updating room: ${roomId}`);
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.updateRoom(roomId, options);
    } catch (error) {
      this.logger.error(`Failed to update room ${roomId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomId: string): Promise<void> {
    try {
      this.logger.log(`Deleting room: ${roomId}`);
      await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.deleteRoom(roomId);
      this.logger.log(`Room deleted successfully: ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to delete room ${roomId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Token Generation (Access Control)
  // ============================================

  /**
   * Generate access token for a participant to join a room
   */
  async generateToken(
    roomId: string,
    identity: string,
    options?: {
      name?: string;
      canPublish?: boolean;
      canSubscribe?: boolean;
      canPublishData?: boolean;
      metadata?: Record<string, any>;
    },
  ): Promise<{ token: string; url: string; roomName: string }> {
    try {
      this.logger.log(`Generating token for ${identity} to join room ${roomId}`);

      const tokenResponse = await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.generateToken(
        roomId,
        identity,
        options,
      );

      this.logger.log(`Token generated successfully for ${identity}`);

      return tokenResponse;
    } catch (error) {
      this.logger.error(`Failed to generate token for ${identity}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Participant Management
  // ============================================

  /**
   * Get participant details
   */
  async getParticipant(roomId: string, participantId: string): Promise<any> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.getParticipant(
        roomId,
        participantId,
      );
    } catch (error) {
      this.logger.error(`Failed to get participant ${participantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * List all participants in a room
   */
  async listParticipants(roomId: string): Promise<any[]> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.listParticipants(roomId);
    } catch (error) {
      this.logger.error(`Failed to list participants: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Remove a participant from a room
   */
  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    try {
      this.logger.log(`Removing participant ${participantId} from room ${roomId}`);
      await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.removeParticipant(
        roomId,
        participantId,
      );
      this.logger.log(`Participant removed successfully`);
    } catch (error) {
      this.logger.error(`Failed to remove participant ${participantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Recording Management
  // ============================================

  /**
   * Start recording a room session
   */
  async startRecording(roomId: string, config?: any): Promise<any> {
    try {
      this.logger.log(`Starting recording for room ${roomId}`);
      const recording = await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.startRecording(
        roomId,
        config,
      );
      this.logger.log(`Recording started: ${recording.id}`);
      return recording;
    } catch (error) {
      this.logger.error(`Failed to start recording: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Stop an active recording
   */
  async stopRecording(roomId: string, recordingId: string): Promise<void> {
    try {
      this.logger.log(`Stopping recording: ${recordingId} in room: ${roomId}`);
      await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.stopRecording(roomId, recordingId);
      this.logger.log(`Recording stopped successfully`);
    } catch (error) {
      this.logger.error(`Failed to stop recording: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get recording details
   */
  async getRecording(roomId: string): Promise<any> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.getRecording(roomId);
    } catch (error) {
      this.logger.error(`Failed to get recording: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * List all recordings for a room
   */
  async listRecordings(roomId: string): Promise<any[]> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.listRecordings(roomId);
    } catch (error) {
      this.logger.error(`Failed to list recordings: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get recording by egress ID (includes file URL when ready)
   * This is the correct way to check if a recording has completed processing
   */
  async getRecordingByEgressId(egressId: string): Promise<any> {
    try {
      this.logger.log(`Getting recording by egress ID: ${egressId}`);

      // Use SDK's internal HTTP client which has proper authentication
      const client = this.db.client as any;

      if (client.httpClient) {
        // Use SDK's HTTP client with proper auth
        const response = await client.httpClient.get(`/video-conferencing/recordings/egress/${egressId}`);
        this.logger.log(`Recording response:`, JSON.stringify(response, null, 2));
        return response?.data || response;
      }

      // Fallback: Try SDK's videoConferencing module if it has getRecordingByEgressId
      if (client.videoConferencing?.getRecordingByEgressId) {
        const response = await client.videoConferencing.getRecordingByEgressId(egressId);
        this.logger.log(`Recording response:`, JSON.stringify(response, null, 2));
        return response;
      }

      throw new Error('No HTTP client available for recording status check');
    } catch (error) {
      this.logger.error(`Failed to get recording by egress ID: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Download a recording file
   */
  async downloadRecording(egressId: string): Promise<Buffer> {
    try {
      this.logger.log(`Downloading recording: ${egressId}`);

      // Use the SDK's download method
      const recordingBuffer = await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.downloadRecording(egressId);

      this.logger.log(`Recording downloaded successfully, size: ${recordingBuffer.length} bytes`);
      return recordingBuffer;
    } catch (error) {
      this.logger.error(`Failed to download recording: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Session Analytics
  // ============================================

  /**
   * Get session statistics (quality metrics, bandwidth, latency, etc.)
   */
  async getSessionStats(sessionId: string): Promise<any> {
    try {
      return await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.getSessionStats(sessionId);
    } catch (error) {
      this.logger.error(`Failed to get session stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Streaming (RTMP/HLS)
  // ============================================

  /**
   * Start egress (RTMP/HLS streaming to external platforms)
   */
  async startEgress(options: any): Promise<any> {
    try {
      this.logger.log(`Starting egress for room ${options.roomId}`);
      const egress = await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.startEgress(options);
      this.logger.log(`Egress started: ${egress.id}`);
      return egress;
    } catch (error) {
      this.logger.error(`Failed to start egress: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Stop an active egress
   */
  async stopEgress(egressId: string): Promise<void> {
    try {
      this.logger.log(`Stopping egress: ${egressId}`);
      await /* TODO: use LiveKit SDK */ this.db.client.videoConferencing.stopEgress(egressId);
      this.logger.log(`Egress stopped successfully`);
    } catch (error) {
      this.logger.error(`Failed to stop egress: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get direct access to the video conferencing client
   */
  getClient() {
    return /* TODO: use LiveKit SDK */ this.db.client.videoConferencing;
  }

  /**
   * Check if video conferencing is available
   */
  isAvailable(): boolean {
    try {
      return !!/* TODO: use LiveKit SDK */ this.db.client.videoConferencing;
    } catch {
      return false;
    }
  }
}
