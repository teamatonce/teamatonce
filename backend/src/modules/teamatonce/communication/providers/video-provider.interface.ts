/**
 * Common interface that every video conferencing provider implements.
 *
 * Pick a provider by setting VIDEO_PROVIDER in your .env to one of:
 *
 *   livekit  - LiveKit Cloud (managed) or self-hosted LiveKit Server.
 *              Full features: rooms, tokens, participants, recording (egress).
 *              Sign up at https://livekit.io/cloud and grab API key/secret +
 *              project URL. ~10 minutes to get running.
 *
 *   daily    - Daily.co (managed). Single REST API with an API key.
 *              Full features including cloud recording (paid plan).
 *              Sign up at https://dashboard.daily.co/. ~5 minutes to set up.
 *
 *   jitsi    - Jitsi Meet. Use the FREE PUBLIC instance at meet.jit.si with
 *              ZERO setup, or point at your own self-hosted Jitsi server.
 *              Optionally use Jitsi as a Service (JaaS) for managed hosting
 *              with auth. Recording requires JaaS or self-hosted Jibri.
 *
 *   none     - Video conferencing disabled. Frontend should hide call UI.
 *              The default if VIDEO_PROVIDER is not set.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in MIGRATION.md.
 */

export interface CreateRoomOptions {
  /** Human-readable room name. The provider may sanitize/transform it. */
  roomName: string;
  /** Maximum participants allowed in the room. Default 50. */
  maxParticipants?: number;
  /** Auto-delete the room this many seconds after the last participant leaves. */
  emptyTimeout?: number;
  /** Arbitrary string metadata stored with the room (provider-dependent). */
  metadata?: string;
  /** Whether to enable recording on this room (provider-dependent). */
  recordingEnabled?: boolean;
}

export interface VideoRoom {
  /** Stable room identifier. For Jitsi this IS the room name. */
  roomId: string;
  /** Provider-side room name (for LiveKit, same as roomId). */
  roomName: string;
  /** When the room was created (ISO 8601 string). */
  createdAt: string;
  /** Direct join URL. For Jitsi this is what users open in a browser. */
  joinUrl?: string;
  /** Provider-specific extra fields. */
  metadata?: string;
  numParticipants?: number;
  maxParticipants?: number;
}

export interface TokenOptions {
  /** Stable identity for the participant (e.g. user ID). */
  identity: string;
  /** Display name shown to other participants. */
  name?: string;
  /** Token TTL, e.g. '24h' or seconds-as-string. Default '24h'. */
  ttl?: string;
  /** Whether the user can publish (camera/mic). Default true. */
  canPublish?: boolean;
  /** Whether the user can subscribe (see/hear others). Default true. */
  canSubscribe?: boolean;
  /** Whether the user can publish data channel messages. Default true. */
  canPublishData?: boolean;
  /** Whether the user is the room admin (can kick, mute, etc.). */
  isAdmin?: boolean;
}

export interface RoomToken {
  /** The auth token (JWT for LiveKit, meeting token for Daily, JWT for JaaS). */
  token: string;
  /** Direct join URL the client should open or pass to the SDK. */
  url: string;
  /** When the token expires (ISO string). */
  expiresAt?: string;
  /** Provider that issued the token. */
  provider: string;
}

export interface Participant {
  identity: string;
  name?: string;
  joinedAt?: string;
  isPublishing?: boolean;
  metadata?: string;
}

export interface RecordingConfig {
  /** File format. Default 'mp4'. */
  fileType?: 'mp4' | 'webm' | 'ogg';
  /** Audio-only recording (no video). */
  audioOnly?: boolean;
  /** Layout for composite recordings (provider-dependent). */
  layout?: 'speaker' | 'grid' | 'single-speaker';
  /** S3-compatible upload destination (overrides provider default). */
  s3Bucket?: string;
  s3KeyPrefix?: string;
}

export interface Recording {
  /** Provider-specific recording / egress / job ID. */
  recordingId: string;
  /** When the recording started. */
  startedAt: string;
  /** Current status. */
  status: 'starting' | 'recording' | 'completed' | 'failed';
  /** URL to the recorded file (only when status === 'completed'). */
  fileUrl?: string;
  /** File size in bytes (only when completed). */
  fileSize?: number;
}

/**
 * Common interface implemented by every video conferencing provider.
 * Methods that a provider doesn't support should throw a clear
 * "not supported by <provider>" error - never silently no-op.
 */
export interface VideoProvider {
  /** Stable provider name for logging / clients. */
  readonly name: 'livekit' | 'daily' | 'jitsi' | 'agora' | 'whereby' | 'none';

  /** True if the provider has the credentials it needs to function. */
  isAvailable(): boolean;

  /** Frontend SDK identifier (used by clients to pick the right SDK). */
  getClientSdkInfo(): {
    /** Provider name to pass to the frontend */
    provider: string;
    /** URL/domain the client SDK connects to */
    serverUrl?: string;
    /** Any extra config the frontend needs to bootstrap (sanitized) */
    publicConfig?: Record<string, any>;
  };

  // Room CRUD
  createRoom(options: CreateRoomOptions): Promise<VideoRoom>;
  getRoom(roomId: string): Promise<VideoRoom | null>;
  listRooms(): Promise<VideoRoom[]>;
  deleteRoom(roomId: string): Promise<void>;

  // Access tokens (clients use these to join rooms)
  generateToken(roomId: string, options: TokenOptions): Promise<RoomToken>;

  // Participant management
  listParticipants(roomId: string): Promise<Participant[]>;
  removeParticipant(roomId: string, identity: string): Promise<void>;

  // Recording (optional - may throw NotSupportedError)
  startRecording(roomId: string, config?: RecordingConfig): Promise<Recording>;
  stopRecording(recordingId: string): Promise<void>;
  getRecording(recordingId: string): Promise<Recording | null>;
}

/**
 * Thrown when a provider is asked to do something it doesn't support
 * (e.g. recording on Jitsi public instance).
 */
export class VideoProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(`Operation "${operation}" is not supported by the "${provider}" video provider. See MIGRATION.md for provider capabilities.`);
    this.name = 'VideoProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider isn't configured (missing API key, etc.).
 */
export class VideoProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(`Video provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See MIGRATION.md.`);
    this.name = 'VideoProviderNotConfiguredError';
  }
}
