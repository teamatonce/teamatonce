/**
 * "None" video conferencing provider - video features are disabled.
 *
 * This is the default if VIDEO_PROVIDER is not set. The frontend should
 * hide all call-related UI when this provider is reported.
 *
 * Every method throws a clear "not configured" error so calling code
 * fails loudly rather than silently no-opping (which is what the old
 * fluxez stub did and what hid bugs).
 */
import { Logger } from '@nestjs/common';
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

export class NoneProvider implements VideoProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneVideoProvider');

  constructor() {
    this.logger.log('Video conferencing is DISABLED (VIDEO_PROVIDER not set or set to "none"). To enable video, set VIDEO_PROVIDER to one of: jitsi, whereby, daily, livekit, agora.');
  }

  isAvailable(): boolean {
    return false;
  }

  getClientSdkInfo() {
    return {
      provider: 'none',
      publicConfig: { disabled: true },
    };
  }

  private fail(op: string): never {
    throw new VideoProviderNotConfiguredError('none', [`VIDEO_PROVIDER (currently unset) - cannot ${op}`]);
  }

  async createRoom(_options: CreateRoomOptions): Promise<VideoRoom> { return this.fail('createRoom'); }
  async getRoom(_roomId: string): Promise<VideoRoom | null> { return null; }
  async listRooms(): Promise<VideoRoom[]> { return []; }
  async deleteRoom(_roomId: string): Promise<void> { /* no-op */ }
  async generateToken(_roomId: string, _options: TokenOptions): Promise<RoomToken> { return this.fail('generateToken'); }
  async listParticipants(_roomId: string): Promise<Participant[]> { return []; }
  async removeParticipant(_roomId: string, _identity: string): Promise<void> { return this.fail('removeParticipant'); }
  async startRecording(_roomId: string, _config?: RecordingConfig): Promise<Recording> { return this.fail('startRecording'); }
  async stopRecording(_recordingId: string): Promise<void> { return this.fail('stopRecording'); }
  async getRecording(_recordingId: string): Promise<Recording | null> { return null; }
}
