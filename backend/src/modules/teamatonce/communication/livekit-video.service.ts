/**
 * Video Conferencing façade.
 *
 * Historically named `LiveKitVideoService` because LiveKit was the only
 * backend — the class name is kept for compatibility with existing import
 * sites, but the underlying implementation is now provider-agnostic.
 *
 * Actual work is dispatched to whichever provider the operator has selected
 * via `VIDEO_PROVIDER` in .env (jitsi / livekit / daily / agora / whereby /
 * none). See `./providers/` and `docs/providers/video.md`.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createVideoProvider,
  VideoProvider,
  VideoProviderNotSupportedError,
  Recording as ProviderRecording,
} from './providers';

@Injectable()
export class LiveKitVideoService implements OnModuleInit {
  private readonly logger = new Logger(LiveKitVideoService.name);
  private provider!: VideoProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createVideoProvider(this.config);
    this.logger.log(
      `Video provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  // ============================================
  // Availability / introspection
  // ============================================

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  getClientSdkInfo() {
    return this.provider?.getClientSdkInfo() ?? { provider: 'none' };
  }

  // ============================================
  // Room Management
  // ============================================

  async createRoom(options: {
    roomName: string;
    maxParticipants?: number;
    recordingEnabled?: boolean;
    metadata?: Record<string, any>;
  }): Promise<{
    roomId: string;
    roomName: string;
    joinUrl?: string;
    embedUrl?: string;
    createdAt: string;
    provider: string;
  }> {
    this.logger.log(`Creating video room: ${options.roomName}`);
    const metadataStr = options.metadata ? JSON.stringify(options.metadata) : undefined;
    const room = await this.provider.createRoom({
      roomName: options.roomName,
      maxParticipants: options.maxParticipants ?? 50,
      recordingEnabled: options.recordingEnabled ?? false,
      metadata: metadataStr,
    });
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      joinUrl: room.joinUrl,
      embedUrl: room.joinUrl,
      createdAt: room.createdAt,
      provider: this.provider.name,
    };
  }

  async getRoom(roomId: string): Promise<any> {
    return this.provider.getRoom(roomId);
  }

  async listRooms(_filters?: any): Promise<any[]> {
    return this.provider.listRooms();
  }

  async updateRoom(_roomId: string, _options: any): Promise<any> {
    throw new VideoProviderNotSupportedError(
      this.provider.name,
      'updateRoom (most providers do not support mutating an existing room; delete and recreate instead)',
    );
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.logger.log(`Deleting video room: ${roomId}`);
    await this.provider.deleteRoom(roomId);
  }

  // ============================================
  // Tokens (access control)
  // ============================================

  async generateToken(
    roomId: string,
    identity: string,
    options?: {
      name?: string;
      canPublish?: boolean;
      canSubscribe?: boolean;
      canPublishData?: boolean;
      isAdmin?: boolean;
      ttl?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<{ token: string; url: string; roomName: string; provider: string }> {
    const tokenResponse = await this.provider.generateToken(roomId, {
      identity,
      name: options?.name,
      canPublish: options?.canPublish,
      canSubscribe: options?.canSubscribe,
      canPublishData: options?.canPublishData,
      isAdmin: options?.isAdmin,
      ttl: options?.ttl,
    });
    return {
      token: tokenResponse.token,
      url: tokenResponse.url,
      roomName: roomId,
      provider: tokenResponse.provider,
    };
  }

  // ============================================
  // Participants
  // ============================================

  async getParticipant(_roomId: string, _participantId: string): Promise<any> {
    const all = await this.provider.listParticipants(_roomId);
    return all.find((p) => p.identity === _participantId) ?? null;
  }

  async listParticipants(roomId: string): Promise<any[]> {
    return this.provider.listParticipants(roomId);
  }

  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    await this.provider.removeParticipant(roomId, participantId);
  }

  // ============================================
  // Recording
  // ============================================

  async startRecording(
    roomId: string,
    config?: {
      fileType?: 'mp4' | 'webm' | 'ogg';
      audioOnly?: boolean;
      layout?: 'speaker' | 'grid' | 'single-speaker';
      s3Bucket?: string;
      s3KeyPrefix?: string;
    },
  ): Promise<{
    recordingId: string;
    startedAt: string;
    status: string;
    // Legacy field name preserved for call sites that expect it.
    database_recording_id: string;
  }> {
    this.logger.log(`Starting recording for room ${roomId}`);
    const rec = await this.provider.startRecording(roomId, config);
    return {
      recordingId: rec.recordingId,
      startedAt: rec.startedAt,
      status: rec.status,
      database_recording_id: rec.recordingId,
    };
  }

  async stopRecording(_roomId: string, recordingId: string): Promise<void> {
    this.logger.log(`Stopping recording: ${recordingId}`);
    await this.provider.stopRecording(recordingId);
  }

  async getRecording(roomId: string): Promise<any> {
    // Legacy signature: "get recording for a room". Providers key
    // recordings by their own id, so this only makes sense when we
    // know the recording id. Callers that need that should use
    // getRecordingByEgressId instead.
    return this.provider.getRecording(roomId);
  }

  async listRecordings(_roomId: string): Promise<any[]> {
    // Providers don't expose a "list by room" API uniformly - return
    // empty rather than throwing to keep legacy callers happy.
    return [];
  }

  /**
   * Kept for compatibility with the scheduler's recording processor job.
   * The "egress id" terminology is LiveKit-specific — in the new abstraction
   * it's just a recording id, and every provider uses the same lookup.
   */
  async getRecordingByEgressId(egressId: string): Promise<
    | (ProviderRecording & {
        // Legacy field aliases some callers still read.
        url?: string;
        recordingUrl?: string;
        size?: number;
        created_at?: string;
      })
    | null
  > {
    const rec = await this.provider.getRecording(egressId);
    if (!rec) return null;
    return {
      ...rec,
      url: rec.fileUrl,
      recordingUrl: rec.fileUrl,
      size: rec.fileSize,
      created_at: rec.startedAt,
    };
  }

  async downloadRecording(_egressId: string): Promise<Buffer> {
    // Most providers give you a signed URL, not a raw buffer — callers
    // should fetch the URL from getRecording() themselves. Keep this
    // method so the old API still exists but throw a clear error.
    throw new VideoProviderNotSupportedError(
      this.provider.name,
      'downloadRecording (the provider returns a signed URL in getRecording().fileUrl — fetch that directly from the scheduler)',
    );
  }

  // ============================================
  // Analytics / streaming — unsupported across most providers
  // ============================================

  async getSessionStats(_sessionId: string): Promise<any> {
    throw new VideoProviderNotSupportedError(
      this.provider.name,
      'getSessionStats (session analytics are provider-specific; use the provider dashboard)',
    );
  }

  async startEgress(_options: any): Promise<any> {
    // Legacy LiveKit concept; maps to startRecording for providers that
    // support egress/streaming. Callers should use startRecording.
    throw new VideoProviderNotSupportedError(
      this.provider.name,
      'startEgress (use startRecording instead — RTMP/HLS streaming is LiveKit-specific)',
    );
  }

  async stopEgress(egressId: string): Promise<void> {
    await this.provider.stopRecording(egressId);
  }

  /**
   * Direct access to the underlying provider, for advanced call sites that
   * need provider-specific features. Prefer the methods above.
   */
  getClient(): VideoProvider {
    return this.provider;
  }
}
