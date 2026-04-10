/**
 * Daily.co video conferencing provider.
 *
 * Easiest path to a working video stack: sign up at https://dashboard.daily.co/,
 * create a domain, copy the API key, set 2 env vars, done. Takes ~5 minutes.
 *
 * Required env vars:
 *   DAILY_API_KEY    - From https://dashboard.daily.co/developers
 *   DAILY_DOMAIN     - Your Daily subdomain, e.g. "mycompany" if your URL
 *                      is https://mycompany.daily.co
 *
 * Optional env vars:
 *   DAILY_RECORDING_ENABLED  - "true" to enable cloud recording on new rooms
 *                              (requires Daily paid plan)
 *
 * Free tier: 10,000 monthly participant minutes for prebuilt UI, includes
 * unlimited rooms and up to 5 participants per room. Enough for most teams.
 *
 * Frontend SDK: @daily-co/daily-js (npm install @daily-co/daily-js) OR the
 * Daily Prebuilt iframe (zero JS - just embed an <iframe>).
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

const DAILY_API_BASE = 'https://api.daily.co/v1';

export class DailyProvider implements VideoProvider {
  readonly name = 'daily' as const;
  private readonly logger = new Logger('DailyProvider');

  private readonly apiKey: string;
  private readonly domain: string;
  private readonly recordingEnabled: boolean;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('DAILY_API_KEY', '');
    this.domain = config.get<string>('DAILY_DOMAIN', '');
    this.recordingEnabled =
      String(config.get<string>('DAILY_RECORDING_ENABLED', 'false')).toLowerCase() === 'true';

    if (this.isAvailable()) {
      this.logger.log(`Daily.co provider configured: ${this.domain}.daily.co`);
    } else {
      this.logger.warn('Daily.co provider selected but DAILY_API_KEY/DAILY_DOMAIN missing');
    }
  }

  isAvailable(): boolean {
    return !!(this.apiKey && this.domain);
  }

  getClientSdkInfo() {
    return {
      provider: 'daily',
      serverUrl: `https://${this.domain}.daily.co`,
      publicConfig: {
        domain: this.domain,
      },
    };
  }

  private async dailyApi(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new VideoProviderNotConfiguredError('daily', this.missingVars());
    }
    const res = await fetch(`${DAILY_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Daily.co API ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.apiKey) out.push('DAILY_API_KEY');
    if (!this.domain) out.push('DAILY_DOMAIN');
    return out;
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    const sanitized = options.roomName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().slice(0, 60);
    const expiresIn = options.emptyTimeout ?? 24 * 60 * 60; // 1 day default

    const created = await this.dailyApi('POST', '/rooms', {
      name: sanitized,
      privacy: 'private',
      properties: {
        max_participants: options.maxParticipants ?? 50,
        eject_at_room_exp: true,
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        enable_recording:
          options.recordingEnabled || this.recordingEnabled ? 'cloud' : undefined,
      },
    });

    return {
      roomId: created.name,
      roomName: created.name,
      createdAt: new Date(created.created_at).toISOString(),
      joinUrl: created.url,
      maxParticipants: options.maxParticipants ?? 50,
      numParticipants: 0,
    };
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    try {
      const room = await this.dailyApi('GET', `/rooms/${encodeURIComponent(roomId)}`);
      return {
        roomId: room.name,
        roomName: room.name,
        createdAt: new Date(room.created_at).toISOString(),
        joinUrl: room.url,
        maxParticipants: room.config?.max_participants,
      };
    } catch (e: any) {
      if (e.message?.includes(' 404 ')) return null;
      throw e;
    }
  }

  async listRooms(): Promise<VideoRoom[]> {
    const list = await this.dailyApi('GET', '/rooms?limit=100');
    return (list.data || []).map((r: any) => ({
      roomId: r.name,
      roomName: r.name,
      createdAt: new Date(r.created_at).toISOString(),
      joinUrl: r.url,
      maxParticipants: r.config?.max_participants,
    }));
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.dailyApi('DELETE', `/rooms/${encodeURIComponent(roomId)}`);
  }

  async generateToken(roomId: string, options: TokenOptions): Promise<RoomToken> {
    const ttlSeconds = this.parseTtl(options.ttl ?? '24h');
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

    const token = await this.dailyApi('POST', '/meeting-tokens', {
      properties: {
        room_name: roomId,
        user_id: options.identity,
        user_name: options.name ?? options.identity,
        is_owner: options.isAdmin === true,
        exp,
        enable_screenshare: options.canPublish !== false,
        start_audio_off: false,
        start_video_off: false,
      },
    });

    const url = `https://${this.domain}.daily.co/${roomId}?t=${token.token}`;
    return {
      token: token.token,
      url,
      expiresAt: new Date(exp * 1000).toISOString(),
      provider: 'daily',
    };
  }

  async listParticipants(roomId: string): Promise<Participant[]> {
    // Daily exposes presence via the /presence endpoint (room-level).
    try {
      const presence = await this.dailyApi('GET', `/presence`);
      const room = (presence.data || presence)[roomId] || [];
      return (room as any[]).map((p: any) => ({
        identity: p.userId || p.id,
        name: p.userName,
        joinedAt: p.joinTime ? new Date(p.joinTime).toISOString() : undefined,
        isPublishing: true,
      }));
    } catch {
      return [];
    }
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    // Daily doesn't have a REST "kick" endpoint - eject is done via the
    // client SDK with an admin token. Document this limitation.
    throw new VideoProviderNotSupportedError('daily', 'removeParticipant (use the client-side daily-js sendAppMessage / eject from the room owner)');
  }

  async startRecording(roomId: string, _config: RecordingConfig = {}): Promise<Recording> {
    if (!this.recordingEnabled) {
      throw new VideoProviderNotSupportedError('daily', 'startRecording (set DAILY_RECORDING_ENABLED=true and ensure your Daily plan supports cloud recording)');
    }
    // Daily cloud recording is started client-side via daily-js .startRecording().
    // Server-side starting requires the meeting-recording API which is plan-gated.
    // We expose a placeholder so the caller can pass it through.
    return {
      recordingId: `daily-${roomId}-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: 'starting',
    };
  }

  async stopRecording(_recordingId: string): Promise<void> {
    throw new VideoProviderNotSupportedError('daily', 'stopRecording (use the client-side daily-js .stopRecording())');
  }

  async getRecording(recordingId: string): Promise<Recording | null> {
    try {
      // Daily exposes recordings via /recordings endpoint
      const list = await this.dailyApi('GET', `/recordings?room_name=${encodeURIComponent(recordingId.split('-')[1] || '')}&limit=10`);
      const rec = (list.data || [])[0];
      if (!rec) return null;
      return {
        recordingId: rec.id,
        startedAt: new Date(rec.start_ts * 1000).toISOString(),
        status: rec.status === 'finished' ? 'completed' : 'recording',
        fileUrl: rec.download_link,
        fileSize: rec.duration ? rec.duration * 100_000 : undefined,
      };
    } catch {
      return null;
    }
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
