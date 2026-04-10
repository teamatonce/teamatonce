/**
 * Whereby Embedded video conferencing provider.
 *
 * THIS IS THE EASIEST PAID OPTION ON THE PLANET:
 *
 *   VIDEO_PROVIDER=whereby
 *   WHEREBY_API_KEY=...
 *
 * Two env vars, no SDK on the server (pure REST), and the frontend
 * integration is literally `<iframe src={room.joinUrl} />`. No tokens to
 * generate, no JS SDK to load, no complicated auth model. The room URL
 * IS the join token (single-use rooms with built-in expiry).
 *
 * Required env vars:
 *   WHEREBY_API_KEY    - Bearer token from https://whereby.com/org/<your-org>/api
 *
 * Optional env vars:
 *   WHEREBY_ROOM_MODE  - "normal" (up to 200 participants, default) or
 *                        "group" (large rooms with rounds-style breakouts)
 *
 * Free tier: 100 monthly meeting minutes for the embedded API. Enough to
 * try it out; production teams use the paid plan ($9.99+/host/month).
 * Sign up at https://whereby.com/org/signup.
 *
 * Frontend integration:
 *
 *   import { useState, useEffect } from 'react';
 *
 *   function CallScreen({ roomName }) {
 *     const [joinUrl, setJoinUrl] = useState('');
 *     useEffect(() => {
 *       fetch(`/api/v1/video/rooms/${roomName}/join`)
 *         .then(r => r.json())
 *         .then(d => setJoinUrl(d.url));
 *     }, [roomName]);
 *     return joinUrl ? (
 *       <iframe
 *         src={joinUrl}
 *         allow="camera; microphone; fullscreen; display-capture"
 *         style={{ width: '100%', height: '600px', border: 0 }}
 *       />
 *     ) : null;
 *   }
 *
 * That's the entire frontend. No SDK install. No build step. Works in
 * every browser that supports iframes.
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

const WHEREBY_API_BASE = 'https://api.whereby.dev/v1';

export class WherebyProvider implements VideoProvider {
  readonly name = 'whereby' as const;
  private readonly logger = new Logger('WherebyProvider');

  private readonly apiKey: string;
  private readonly roomMode: 'normal' | 'group';

  // Whereby creates a fresh room URL on every call - we cache by name so
  // multiple "join" requests for the same logical room reuse the same URL.
  private readonly roomCache = new Map<string, VideoRoom>();

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('WHEREBY_API_KEY', '');
    const mode = config.get<string>('WHEREBY_ROOM_MODE', 'normal');
    this.roomMode = mode === 'group' ? 'group' : 'normal';

    if (this.isAvailable()) {
      this.logger.log(`Whereby provider configured (mode: ${this.roomMode})`);
    } else {
      this.logger.warn('Whereby provider selected but WHEREBY_API_KEY missing');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getClientSdkInfo() {
    return {
      provider: 'whereby',
      // No SDK or server URL needed - the frontend just opens the room URL
      // returned by createRoom() / generateToken() in an iframe.
      publicConfig: {
        embedMode: 'iframe',
        // Permissions the iframe needs to actually use the camera/mic.
        recommendedAllow: 'camera; microphone; fullscreen; display-capture; autoplay',
      },
    };
  }

  private async wherebyApi(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new VideoProviderNotConfiguredError('whereby', ['WHEREBY_API_KEY']);
    }
    const res = await fetch(`${WHEREBY_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Whereby API ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    // Whereby rooms have a built-in expiry; default to 1 day if not provided.
    const ttlSec = options.emptyTimeout ?? 24 * 60 * 60;
    const endDate = new Date(Date.now() + ttlSec * 1000).toISOString();

    const created = await this.wherebyApi('POST', '/meetings', {
      isLocked: false,
      roomNamePrefix: this.sanitizePrefix(options.roomName),
      roomMode: this.roomMode,
      endDate,
      fields: ['hostRoomUrl'],
    });

    const room: VideoRoom = {
      roomId: created.meetingId,
      roomName: created.roomName || options.roomName,
      createdAt: new Date(created.startDate || Date.now()).toISOString(),
      joinUrl: created.roomUrl,
      maxParticipants: options.maxParticipants,
      numParticipants: 0,
      // Stash the host URL in metadata so admin tokens can use it.
      metadata: created.hostRoomUrl,
    };
    this.roomCache.set(created.meetingId, room);
    return room;
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    return this.roomCache.get(roomId) ?? null;
  }

  async listRooms(): Promise<VideoRoom[]> {
    return Array.from(this.roomCache.values());
  }

  async deleteRoom(roomId: string): Promise<void> {
    try {
      await this.wherebyApi('DELETE', `/meetings/${encodeURIComponent(roomId)}`);
    } finally {
      this.roomCache.delete(roomId);
    }
  }

  async generateToken(roomId: string, options: TokenOptions): Promise<RoomToken> {
    // Whereby's "token" IS the room URL - no JWT to sign. We return the
    // host URL for admin users (they can mute/kick from the embedded UI)
    // and the regular room URL for everyone else. If the room isn't in
    // our cache, we just construct the URL directly.
    const cached = this.roomCache.get(roomId);

    let url: string;
    if (cached) {
      url = options.isAdmin && cached.metadata ? cached.metadata : cached.joinUrl!;
    } else {
      // Cache miss: we don't have the room URL. Create a new one on the
      // fly. (This happens when the app restarts and loses in-memory state.)
      const fresh = await this.createRoom({ roomName: roomId });
      url = options.isAdmin && fresh.metadata ? fresh.metadata : fresh.joinUrl!;
    }

    // Whereby supports passing user info via URL query params so the
    // embedded UI shows the right name without any SDK.
    if (options.name) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}displayName=${encodeURIComponent(options.name)}`;
    }

    return {
      token: url,  // No separate token; the URL is the token.
      url,
      provider: 'whereby',
    };
  }

  async listParticipants(_roomId: string): Promise<Participant[]> {
    // Whereby's REST API doesn't expose live participant lists - presence
    // is inside the iframe only. Return empty.
    return [];
  }

  async removeParticipant(_roomId: string, _identity: string): Promise<void> {
    throw new VideoProviderNotSupportedError(
      'whereby',
      'removeParticipant (host can mute/kick directly from the embedded Whereby UI; there is no server-side eject API)',
    );
  }

  async startRecording(_roomId: string, _config?: RecordingConfig): Promise<Recording> {
    // Whereby has cloud recording but it's started/stopped from the
    // embedded UI by the host, not via the REST API.
    throw new VideoProviderNotSupportedError(
      'whereby',
      'startRecording (recording is started from the embedded Whereby UI by the host; there is no server-side recording API on Embedded plans)',
    );
  }

  async stopRecording(_recordingId: string): Promise<void> {
    throw new VideoProviderNotSupportedError('whereby', 'stopRecording');
  }

  async getRecording(_recordingId: string): Promise<Recording | null> {
    return null;
  }

  /**
   * Whereby room name prefixes must be 1-20 chars, alphanumeric.
   * Invalid characters are stripped, and we truncate the result.
   */
  private sanitizePrefix(name: string): string {
    return (name || 'room')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 20) || 'room';
  }
}
