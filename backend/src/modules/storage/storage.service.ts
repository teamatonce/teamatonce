/**
 * StorageService — the app's storage façade.
 *
 * Exposes the same public methods vasty-shop has always had
 * (uploadFile / downloadFile / deleteFile / getPublicUrl / createSignedUrl /
 * listFiles) so existing call sites don't need to change, and internally
 * dispatches every call to whichever provider the operator has selected
 * via `STORAGE_PROVIDER` in .env.
 *
 * See `./providers/` and `docs/providers/storage.md` for the full list
 * of backends (local-fs, s3, r2, minio, b2, gcs, azure, none) and their
 * env vars.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createStorageProvider, StorageProvider } from './providers';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private provider!: StorageProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.provider = createStorageProvider(this.configService);
    this.logger.log(
      `Storage provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  /**
   * Direct access to the underlying provider for advanced callers. Prefer
   * the higher-level methods below.
   */
  getProvider(): StorageProvider {
    return this.provider;
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  // =====================================================================
  // Public API — preserved from the pre-adapter StorageService so existing
  // call sites keep working without changes.
  // =====================================================================

  async uploadFile(
    bucket: string,
    fileBuffer: Buffer,
    path: string,
    options?: { contentType?: string; metadata?: Record<string, string> },
  ): Promise<{ path: string; url: string }> {
    const result = await this.provider.put(bucket, path, fileBuffer, {
      contentType: options?.contentType,
      metadata: options?.metadata,
      acl: 'public',
    });
    return { path: result.path, url: result.url };
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    return this.provider.get(bucket, path);
  }

  async deleteFile(bucket: string, path: string): Promise<void> {
    return this.provider.delete(bucket, path);
  }

  getPublicUrl(bucket: string, path: string): string {
    return this.provider.getPublicUrl(bucket, path);
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    return this.provider.getSignedUrl(bucket, path, expiresIn);
  }

  async listFiles(
    bucket: string,
    prefix?: string,
  ): Promise<{ key: string; size: number; lastModified: Date }[]> {
    return this.provider.list(bucket, prefix);
  }
}
