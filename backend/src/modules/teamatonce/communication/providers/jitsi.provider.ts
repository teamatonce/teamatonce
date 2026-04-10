/**
 * Jitsi Meet video conferencing provider.
 *
 * THIS IS THE EASIEST OPTION FOR ANYONE WHO WANTS VIDEO TODAY:
 *
 *   VIDEO_PROVIDER=jitsi
 *
 * That's it. With zero other config, the app uses the FREE PUBLIC Jitsi
 * instance at https://meet.jit.si - no signup, no API key, no infra.
 * Great for self-hosters, hobbyists, and small teams. Recording is not
 * available on the public instance, but everything else (rooms,
 * participants, screen share, chat) just works.
 *
 * Optional env vars:
 *
 *   JITSI_DOMAIN     - Use a different Jitsi server. Defaults to "meet.jit.si"
 *                      (the free public instance). Set to your own self-hosted
 *                      Jitsi (e.g. "meet.your-domain.com") for a private
 *                      production deployment, or to "8x8.vc" if using JaaS.
 *
 *   JITSI_APP_ID     - For Jitsi as a Service (JaaS) - your AppID from
 *                      https://jaas.8x8.vc. Without this, room URLs are
 *                      "https://<domain>/<room>" with no auth (anyone with
 *                      the URL can join).
 *
 *   JITSI_PRIVATE_KEY - JaaS RS256 private key (PEM) for signing JWTs. Only
 *                       needed if you're using JaaS or a self-hosted Jitsi
 *                       with JWT auth enabled.
 *
 *   JITSI_KEY_ID     - JaaS key ID (kid claim).
 *
 * Frontend: load https://<domain>/external_api.js as a <script> tag and use
 * the JitsiMeetExternalAPI class. Or use the @jitsi/react-sdk npm package.
 *
 * Recording: NOT supported on the free meet.jit.si instance. Available with
 * JaaS (paid) or self-hosted Jitsi running Jibri.
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
  VideoProviderNotSupportedError,
  VideoRoom,
} from './video-provider.interface';

export class JitsiProvider implements VideoProvider {
  readonly name = 'jitsi' as const;
  private readonly logger = new Logger('JitsiProvider');

  private readonly domain: string;
  private readonly appId?: string;
  private readonly privateKey?: string;
  private readonly keyId?: string;

  // Jitsi has no concept of server-side rooms - rooms are created
  // implicitly when the first user joins. We track created rooms
  // in-memory so listRooms()/getRoom() return something useful.
  private readonly knownRooms = new Map<string, VideoRoom>();

  constructor(config: ConfigService) {
    this.domain = config.get<string>('JITSI_DOMAIN', 'meet.jit.si');
    this.appId = config.get<string>('JITSI_APP_ID');
    this.privateKey = config.get<string>('JITSI_PRIVATE_KEY');
    this.keyId = config.get<string>('JITSI_KEY_ID');

    this.logger.log(`Jitsi provider configured: ${this.domain}${this.appId ? ' (JaaS)' : ' (anonymous, public)'}`);
  }

  isAvailable(): boolean {
    // Jitsi is ALWAYS available - the public meet.jit.si instance
    // requires no setup at all.
    return true;
  }

  getClientSdkInfo() {
    return {
      provider: 'jitsi',
      serverUrl: `https://${this.domain}`,
      publicConfig: {
        domain: this.domain,
        // Frontend should load https://<domain>/external_api.js
        externalApiUrl: `https://${this.domain}/external_api.js`,
        // If JaaS, frontend prefixes room names with the app ID
        appId: this.appId,
        usingJaas: !!this.appId,
      },
    };
  }

  /**
   * Sanitize a room name into a Jitsi-safe slug.
   * Jitsi room names must be unique-ish and URL-safe.
   */
  private sanitize(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60) || `room-${Date.now()}`;
  }

  private buildRoomUrl(roomId: string): string {
    if (this.appId) {
      // JaaS URL format: https://8x8.vc/<appId>/<room>
      return `https://${this.domain}/${this.appId}/${roomId}`;
    }
    return `https://${this.domain}/${roomId}`;
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    const roomId = this.sanitize(options.roomName);
    const room: VideoRoom = {
      roomId,
      roomName: roomId,
      createdAt: new Date().toISOString(),
      joinUrl: this.buildRoomUrl(roomId),
      maxParticipants: options.maxParticipants,
      numParticipants: 0,
      metadata: options.metadata,
    };
    this.knownRooms.set(roomId, room);
    return room;
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    return this.knownRooms.get(roomId) ?? {
      // Even if we didn't track it, we can synthesize a record because
      // Jitsi rooms are URL-addressable - any room name "exists".
      roomId,
      roomName: roomId,
      createdAt: new Date().toISOString(),
      joinUrl: this.buildRoomUrl(roomId),
    };
  }

  async listRooms(): Promise<VideoRoom[]> {
    return Array.from(this.knownRooms.values());
  }

  async deleteRoom(roomId: string): Promise<void> {
    // Jitsi rooms auto-cleanup when empty - we just forget our local record.
    this.knownRooms.delete(roomId);
  }

  async generateToken(roomId: string, options: TokenOptions): Promise<RoomToken> {
    const url = this.buildRoomUrl(roomId);

    // No JaaS / no private key → anonymous access. The "token" is just an
    // empty string and the URL is the join link. Frontend can pass user
    // info via JitsiMeetExternalAPI's userInfo option without needing JWT.
    if (!this.appId || !this.privateKey) {
      return {
        token: '',
        url,
        provider: 'jitsi',
      };
    }

    // JaaS / authenticated mode: sign a JWT with the private key.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    const ttlSeconds = this.parseTtl(options.ttl ?? '24h');
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

    const payload = {
      aud: 'jitsi',
      iss: 'chat',
      sub: this.appId,
      room: roomId,
      exp,
      context: {
        user: {
          id: options.identity,
          name: options.name ?? options.identity,
          moderator: options.isAdmin === true,
        },
        features: {
          livestreaming: options.isAdmin === true,
          recording: options.isAdmin === true,
          'screen-sharing': options.canPublish !== false,
        },
      },
    };

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.keyId,
    });

    return {
      token,
      url: `${url}?jwt=${token}`,
      expiresAt: new Date(exp * 1000).toISOString(),
      provider: 'jitsi',
    };
  }

  async listParticipants(_roomId: string): Promise<Participant[]> {
    // Jitsi has no server-side participant API on the public instance.
    // Participants are visible only to clients in the room.
    return [];
  }

  async removeParticipant(_roomId: string, _identity: string): Promise<void> {
    throw new VideoProviderNotSupportedError(
      'jitsi',
      'removeParticipant (Jitsi participant management is client-side only; the room moderator can kick via the Jitsi UI or via JitsiMeetExternalAPI on the frontend)',
    );
  }

  async startRecording(_roomId: string, _config?: RecordingConfig): Promise<Recording> {
    throw new VideoProviderNotSupportedError(
      'jitsi',
      'startRecording (recording requires Jitsi as a Service (JaaS) with a paid plan, OR self-hosted Jitsi with Jibri configured. The free meet.jit.si public instance does not support server-initiated recording.)',
    );
  }

  async stopRecording(_recordingId: string): Promise<void> {
    throw new VideoProviderNotSupportedError('jitsi', 'stopRecording');
  }

  async getRecording(_recordingId: string): Promise<Recording | null> {
    return null;
  }

  private parseTtl(ttl: string): number {
    const m = ttl.match(/^(\d+)\s*([hdms]?)$/);
    if (!m) return 24 * 60 * 60;
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
