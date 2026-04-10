/**
 * LiveKit video conferencing provider.
 *
 * Works with both LiveKit Cloud (managed) and self-hosted LiveKit Server.
 *
 * Required env vars:
 *   LIVEKIT_URL          - wss://your-project.livekit.cloud   (or wss://your-self-hosted-host)
 *   LIVEKIT_API_KEY      - LiveKit API key
 *   LIVEKIT_API_SECRET   - LiveKit API secret
 *
 * Optional env vars:
 *   LIVEKIT_WEBHOOK_SECRET   - For validating webhook events
 *   LIVEKIT_RECORDING_BUCKET - S3-compatible bucket for recording uploads
 *                              (defaults to STORAGE_BUCKET_DEFAULT if set)
 *
 * Sign up at https://livekit.io/cloud (free tier: 50 monthly meeting minutes
 * + 100 max participants per room) or self-host with the LiveKit docker image.
 *
 * Frontend SDK: livekit-client (npm install livekit-client)
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateRoomOptions,
  Participant,
  Recording,
  RecordingConfig,
  RoomToken,
  TokenOptions,
  VideoProvider,
  VideoProviderNotConfiguredError,
  VideoRoom,
} from './video-provider.interface';

export class LiveKitProvider implements VideoProvider {
  readonly name = 'livekit' as const;
  private readonly logger = new Logger('LiveKitProvider');

  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly webhookSecret?: string;
  private readonly recordingBucket?: string;

  // Lazy-loaded SDK clients (so the dep is truly optional at runtime)
  private roomService: any;
  private egressService: any;
  private accessTokenClass: any;
  private sdkLoaded = false;

  constructor(config: ConfigService) {
    this.url = config.get<string>('LIVEKIT_URL', '');
    this.apiKey = config.get<string>('LIVEKIT_API_KEY', '');
    this.apiSecret = config.get<string>('LIVEKIT_API_SECRET', '');
    this.webhookSecret = config.get<string>('LIVEKIT_WEBHOOK_SECRET');
    this.recordingBucket =
      config.get<string>('LIVEKIT_RECORDING_BUCKET') ||
      config.get<string>('STORAGE_BUCKET_DEFAULT');

    if (this.isAvailable()) {
      this.logger.log(`LiveKit provider configured: ${this.url}`);
    } else {
      this.logger.warn('LiveKit provider selected but not fully configured (LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET missing)');
    }
  }

  isAvailable(): boolean {
    return !!(this.url && this.apiKey && this.apiSecret);
  }

  getClientSdkInfo() {
    return {
      provider: 'livekit',
      serverUrl: this.url,
      publicConfig: {
        // Clients use livekit-client SDK; serverUrl + the JWT from
        // generateToken() is everything they need to join.
      },
    };
  }

  /**
   * Lazy-load livekit-server-sdk only when actually needed. This keeps
   * the dependency optional - if a self-hoster picks daily/jitsi/none,
   * they don't need to install livekit-server-sdk at all.
   */
  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new VideoProviderNotConfiguredError('livekit', this.missingVars());
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('livekit-server-sdk');
      this.roomService = new sdk.RoomServiceClient(this.url, this.apiKey, this.apiSecret);
      this.egressService = new sdk.EgressClient(this.url, this.apiKey, this.apiSecret);
      this.accessTokenClass = sdk.AccessToken;
      this.sdkLoaded = true;
      this.logger.log('livekit-server-sdk loaded');
    } catch (e: any) {
      throw new Error(
        `LiveKit provider selected but the "livekit-server-sdk" package is not installed. ` +
        `Run: npm install livekit-server-sdk    Original error: ${e.message}`,
      );
    }
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.url) out.push('LIVEKIT_URL');
    if (!this.apiKey) out.push('LIVEKIT_API_KEY');
    if (!this.apiSecret) out.push('LIVEKIT_API_SECRET');
    return out;
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    this.loadSdk();
    const room = await this.roomService.createRoom({
      name: options.roomName,
      emptyTimeout: options.emptyTimeout ?? 300,
      maxParticipants: options.maxParticipants ?? 50,
      metadata: options.metadata ?? '',
    });
    return {
      roomId: room.name,
      roomName: room.name,
      createdAt: new Date(Number(room.creationTime) * 1000).toISOString(),
      maxParticipants: options.maxParticipants ?? 50,
      numParticipants: 0,
      metadata: options.metadata,
    };
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    this.loadSdk();
    const rooms = await this.roomService.listRooms([roomId]);
    if (rooms.length === 0) return null;
    const room = rooms[0];
    return {
      roomId: room.name,
      roomName: room.name,
      createdAt: new Date(Number(room.creationTime) * 1000).toISOString(),
      numParticipants: room.numParticipants,
      maxParticipants: room.maxParticipants,
      metadata: room.metadata,
    };
  }

  async listRooms(): Promise<VideoRoom[]> {
    this.loadSdk();
    const rooms = await this.roomService.listRooms();
    return rooms.map((r: any) => ({
      roomId: r.name,
      roomName: r.name,
      createdAt: new Date(Number(r.creationTime) * 1000).toISOString(),
      numParticipants: r.numParticipants,
      maxParticipants: r.maxParticipants,
      metadata: r.metadata,
    }));
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.loadSdk();
    await this.roomService.deleteRoom(roomId);
  }

  async generateToken(roomId: string, options: TokenOptions): Promise<RoomToken> {
    this.loadSdk();
    const token = new this.accessTokenClass(this.apiKey, this.apiSecret, {
      identity: options.identity,
      name: options.name,
      ttl: options.ttl ?? '24h',
    });
    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: options.canPublish !== false,
      canSubscribe: options.canSubscribe !== false,
      canPublishData: options.canPublishData !== false,
      roomAdmin: options.isAdmin === true,
    });
    const jwt = await token.toJwt();
    return {
      token: jwt,
      url: this.url,
      provider: 'livekit',
    };
  }

  async listParticipants(roomId: string): Promise<Participant[]> {
    this.loadSdk();
    const participants = await this.roomService.listParticipants(roomId);
    return participants.map((p: any) => ({
      identity: p.identity,
      name: p.name,
      joinedAt: p.joinedAt ? new Date(Number(p.joinedAt) * 1000).toISOString() : undefined,
      isPublishing: (p.tracks || []).length > 0,
      metadata: p.metadata,
    }));
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    this.loadSdk();
    await this.roomService.removeParticipant(roomId, identity);
  }

  async startRecording(roomId: string, config: RecordingConfig = {}): Promise<Recording> {
    this.loadSdk();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sdk = require('livekit-server-sdk');

    const fileType =
      config.fileType === 'webm' ? sdk.EncodedFileType.WEBM :
      config.fileType === 'ogg' ? sdk.EncodedFileType.OGG :
      sdk.EncodedFileType.MP4;

    const filename = `${roomId}-${Date.now()}.${config.fileType ?? 'mp4'}`;
    const keyPrefix = config.s3KeyPrefix ?? 'video-recordings';

    let output: any;
    if (this.recordingBucket) {
      // S3-compatible upload (works with AWS S3, R2, MinIO, etc.) using
      // the same STORAGE_* env vars as the rest of the app.
      const region = process.env.STORAGE_REGION ?? 'auto';
      const endpoint = process.env.STORAGE_ENDPOINT;
      const accessKey = process.env.STORAGE_ACCESS_KEY_ID ?? '';
      const secret = process.env.STORAGE_SECRET_ACCESS_KEY ?? '';

      const s3Upload = new sdk.S3Upload({
        accessKey,
        secret,
        region,
        endpoint,
        bucket: config.s3Bucket ?? this.recordingBucket,
        forcePathStyle: false,
      });
      output = new sdk.EncodedFileOutput({
        fileType,
        filepath: `${keyPrefix}/${filename}`,
        output: { case: 's3', value: s3Upload },
      });
    } else {
      output = new sdk.EncodedFileOutput({
        fileType,
        filepath: `/out/${filename}`,
      });
      this.logger.warn('No recording bucket configured - recording will only be stored locally on the LiveKit server');
    }

    const response = await this.egressService.startRoomCompositeEgress(roomId, output, {
      layout: config.layout ?? 'speaker',
      audioOnly: config.audioOnly ?? false,
      videoOnly: false,
      encodingOptions: sdk.EncodingOptionsPreset.H264_1080P_30,
    });

    return {
      recordingId: response.egressId,
      startedAt: new Date().toISOString(),
      status: 'recording',
    };
  }

  async stopRecording(recordingId: string): Promise<void> {
    this.loadSdk();
    await this.egressService.stopEgress(recordingId);
  }

  async getRecording(recordingId: string): Promise<Recording | null> {
    this.loadSdk();
    const list = await this.egressService.listEgress({ egressId: recordingId });
    if (list.length === 0) return null;
    const e = list[0];
    return {
      recordingId: e.egressId,
      startedAt: e.startedAt
        ? new Date(Number(e.startedAt) / 1_000_000).toISOString()
        : new Date().toISOString(),
      status: e.status === 2 ? 'completed' : e.status === 3 ? 'failed' : 'recording',
      fileUrl: e.fileResults?.[0]?.location ?? e.fileResults?.[0]?.filename,
      fileSize: e.fileResults?.[0]?.size ? Number(e.fileResults[0].size) : undefined,
    };
  }

  /**
   * Validate a LiveKit webhook signature. Used by the webhook controller.
   */
  validateWebhook(body: string, signature: string): boolean {
    if (!this.webhookSecret) return true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('base64');
    return hash === signature;
  }
}
