/**
 * "None" storage provider — file storage is disabled.
 *
 * The default if STORAGE_PROVIDER is unset and no legacy R2_* env vars
 * are detected. Every method throws StorageProviderNotConfiguredError so
 * calling code fails loudly rather than silently no-opping.
 *
 * Unlike the previous StorageService stub which created an undefined
 * S3Client and crashed at runtime with cryptic errors, this provider
 * logs a clear startup message telling the operator which env var to set.
 */
import { Logger } from '@nestjs/common';
import {
  ListedObject,
  PutOptions,
  PutResult,
  StorageProvider,
  StorageProviderNotConfiguredError,
} from './storage-provider.interface';

export class NoneStorageProvider implements StorageProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneStorageProvider');

  constructor() {
    this.logger.log(
      'File storage is DISABLED (STORAGE_PROVIDER not set). To enable, set STORAGE_PROVIDER to one of: local-fs, s3, r2, minio, b2, gcs, azure. See docs/providers/storage.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new StorageProviderNotConfiguredError('none', [
      `STORAGE_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async put(
    _bucket: string,
    _key: string,
    _body: Buffer,
    _options?: PutOptions,
  ): Promise<PutResult> {
    return this.fail('put');
  }
  async get(_bucket: string, _key: string): Promise<Buffer> {
    return this.fail('get');
  }
  async delete(_bucket: string, _key: string): Promise<void> {
    return this.fail('delete');
  }
  async exists(_bucket: string, _key: string): Promise<boolean> {
    return false;
  }
  async list(_bucket: string, _prefix?: string): Promise<ListedObject[]> {
    return [];
  }
  getPublicUrl(_bucket: string, _key: string): string {
    return '';
  }
  async getSignedUrl(
    _bucket: string,
    _key: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    return this.fail('getSignedUrl');
  }
}
