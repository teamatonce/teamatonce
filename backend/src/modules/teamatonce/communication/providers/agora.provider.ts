/**
 * Agora video conferencing provider.
 *
 * Agora is one of the most widely-used real-time video platforms in the
 * world (~10M daily active users on the platform), particularly strong in
 * Asia. Mature SDKs for every platform, generous free tier, simple App ID
 * + App Certificate auth model.
 *
 * Required env vars:
 *   AGORA_APP_ID            - Public App ID from https://console.agora.io
 *   AGORA_APP_CERTIFICATE   - Secret App Certificate (enable in console)
 *
 * Optional env vars:
 *   AGORA_TOKEN_TTL         - Token lifetime in seconds (default 86400 = 24h)
 *
 * Free tier: 10,000 minutes/month free across audio/video. Sign up at
 * https://www.agora.io/en/.
 *
 * Frontend SDK: agora-rtc-sdk-ng (npm install agora-rtc-sdk-ng) for web.
 * The frontend joins a "channel" using the App ID + the token from
 * generateToken() + the user's identity.
 *
 * Note: Agora's primitive is "channels" not "rooms". This provider treats
 * a channel name 1:1 with a roomId so the rest of the app can stay
 * agnostic. There is no server-side "create channel" call - channels are
 * created implicitly when the first client joins (just like Jitsi).
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
  VideoProviderNotSupportedError,
  VideoRoom,
} from './video-provider.interface';

export class AgoraProvider implements VideoProvider {
  readonly name = 'agora' as const;
  private readonly logger = new Logger('AgoraProvider');

  private readonly appId: string;
  private readonly appCertificate: string;
  private readonly defaultTtl: number;

  // Agora channels are URL-addressable; we track created ones in-memory
  // so listRooms()/getRoom() return something useful (mirrors Jitsi).
  private readonly knownChannels = new Map<string, VideoRoom>();

  // Lazy-loaded token builder
  private tokenBuilder: any;
  private sdkLoaded = false;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('AGORA_APP_ID', '');
    this.appCertificate = config.get<string>('AGORA_APP_CERTIFICATE', '');
    this.defaultTtl = parseInt(config.get<string>('AGORA_TOKEN_TTL', '86400'), 10);

    if (this.isAvailable()) {
      this.logger.log(`Agora provider configured (App ID: ${this.appId.slice(0, 6)}...)`);
    } else {
      this.logger.warn('Agora provider selected but AGORA_APP_ID/AGORA_APP_CERTIFICATE missing');
    }
  }

  isAvailable(): boolean {
    return !!(this.appId && this.appCertificate);
  }

  getClientSdkInfo() {
    return {
      provider: 'agora',
      // Agora SDK doesn't need a server URL — clients connect to Agora's
      // global edge network using just the App ID + a channel token.
      publicConfig: {
        appId: this.appId,
        // Frontend uses agora-rtc-sdk-ng:
        //   const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        //   await client.join(appId, channelName, token, uid);
      },
    };
  }

  /**
   * Lazy-load the agora-token package only when actually needed.
   * Same approach as the LiveKit provider: keeps the dep optional for
   * users who pick another provider.
   */
  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new VideoProviderNotConfiguredError('agora', this.missingVars());
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.tokenBuilder = require('agora-token');
      this.sdkLoaded = true;
      this.logger.log('agora-token package loaded');
    } catch (e: any) {
      throw new Error(
        `Agora provider selected but the "agora-token" package is not installed. ` +
        `Run: npm install agora-token    Original error: ${e.message}`,
      );
    }
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.appId) out.push('AGORA_APP_ID');
    if (!this.appCertificate) out.push('AGORA_APP_CERTIFICATE');
    return out;
  }

  private sanitize(name: string): string {
    // Agora channel names: max 64 chars, ASCII letters/digits/some punct.
    return name
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || `room-${Date.now()}`;
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    if (!this.isAvailable()) {
      throw new VideoProviderNotConfiguredError('agora', this.missingVars());
    }
    const channelName = this.sanitize(options.roomName);
    const room: VideoRoom = {
      roomId: channelName,
      roomName: channelName,
      createdAt: new Date().toISOString(),
      maxParticipants: options.maxParticipants ?? 50,
      numParticipants: 0,
      metadata: options.metadata,
    };
    this.knownChannels.set(channelName, room);
    return room;
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    return (
      this.knownChannels.get(roomId) ?? {
        // Channels are URL-addressable, so synthesize a record even if we
        // didn't track creation.
        roomId,
        roomName: roomId,
        createdAt: new Date().toISOString(),
      }
    );
  }

  async listRooms(): Promise<VideoRoom[]> {
    return Array.from(this.knownChannels.values());
  }

  async deleteRoom(roomId: string): Promise<void> {
    // Agora channels auto-cleanup when empty - we just forget the local record.
    this.knownChannels.delete(roomId);
  }

  async generateToken(roomId: string, options: TokenOptions): Promise<RoomToken> {
    this.loadSdk();
    const ttl = this.parseTtl(options.ttl) ?? this.defaultTtl;
    const expireSeconds = ttl;
    const privilegeExpire = Math.floor(Date.now() / 1000) + expireSeconds;

    // Use Agora's RtcTokenBuilder to build a privileged channel token.
    // The user identity is hashed to a stable uint32 uid (Agora's native
    // identity type) so the same string identity always produces the same uid.
    const uid = this.identityToUid(options.identity);
    const role = options.isAdmin || options.canPublish !== false
      ? this.tokenBuilder.RtcRole.PUBLISHER
      : this.tokenBuilder.RtcRole.SUBSCRIBER;

    const token = this.tokenBuilder.RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      roomId,
      uid,
      role,
      privilegeExpire,
      privilegeExpire,
    );

    return {
      token,
      // Agora doesn't have a "join URL" — clients call AgoraRTC.client.join()
      // directly with the App ID + channel name + token + uid. We surface
      // the channel name as the URL field for callers that just need
      // *something* to display.
      url: `agora://${this.appId}/${roomId}`,
      expiresAt: new Date(privilegeExpire * 1000).toISOString(),
      provider: 'agora',
    };
  }

  async listParticipants(_roomId: string): Promise<Participant[]> {
    // Agora exposes channel presence via the Server RESTful API at
    // https://api.agora.io/dev/v1/channel/user/{appid}/{channelname}
    // but it requires Customer ID + Customer Secret (separate from
    // App ID/Certificate). Skipping for now - returns empty.
    return [];
  }

  async removeParticipant(_roomId: string, _identity: string): Promise<void> {
    // Same: requires the Customer ID/Secret pair via the Server RESTful API.
    throw new VideoProviderNotSupportedError(
      'agora',
      'removeParticipant (requires the Agora Server RESTful API with Customer ID/Secret credentials, separate from the App Certificate; the typical pattern is for the room moderator to do this client-side)',
    );
  }

  async startRecording(_roomId: string, _config?: RecordingConfig): Promise<Recording> {
    // Cloud recording requires the separate Cloud Recording REST API
    // (https://docs.agora.io/en/cloud-recording/develop/overview) which
    // is a different product with its own pricing. Out of scope for the
    // basic provider - throw clearly so callers know.
    throw new VideoProviderNotSupportedError(
      'agora',
      'startRecording (Agora Cloud Recording is a separate product with its own REST API and pricing; integrate via https://docs.agora.io/en/cloud-recording)',
    );
  }

  async stopRecording(_recordingId: string): Promise<void> {
    throw new VideoProviderNotSupportedError('agora', 'stopRecording');
  }

  async getRecording(_recordingId: string): Promise<Recording | null> {
    return null;
  }

  /**
   * Hash a string identity into a stable uint32 uid for Agora's native
   * identity type. Same identity always produces the same uid.
   */
  private identityToUid(identity: string): number {
    let hash = 0;
    for (let i = 0; i < identity.length; i++) {
      hash = (hash * 31 + identity.charCodeAt(i)) | 0;
    }
    // Make sure it's a positive uint32, and reserve 0 (which Agora treats
    // as "let the SDK pick a uid for me").
    const uid = Math.abs(hash);
    return uid === 0 ? 1 : uid;
  }

  private parseTtl(ttl?: string): number | null {
    if (!ttl) return null;
    const m = ttl.match(/^(\d+)\s*([hdms]?)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
      case 'd': return n * 86400;
      case 'h': return n * 3600;
      case 'm': return n * 60;
      case 's': return n;
      default: return n;
    }
  }
}
