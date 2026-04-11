/**
 * Google Cloud Storage provider.
 *
 *   STORAGE_PROVIDER=gcs
 *   GCS_PROJECT_ID=your-project
 *   GCS_KEY_FILE=/path/to/service-account.json    (OR rely on ADC)
 *   STORAGE_BUCKET=your-bucket
 *
 * The `@google-cloud/storage` package is an OPTIONAL dependency — it's
 * lazy-loaded inside loadSdk() only when the provider is actually selected,
 * and declared in optionalDependencies in package.json. Users who pick a
 * different provider never install it.
 *
 * If you select gcs but haven't run `npm install @google-cloud/storage`,
 * the first method call will throw a clear "package not installed" error
 * pointing at the install command.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListedObject,
  PutOptions,
  PutResult,
  StorageProvider,
  StorageProviderNotConfiguredError,
} from './storage-provider.interface';

export class GcsProvider implements StorageProvider {
  readonly name = 'gcs' as const;
  private readonly logger = new Logger('GcsProvider');

  private readonly projectId: string;
  private readonly keyFile?: string;
  private readonly publicUrl?: string;

  private sdkLoaded = false;
  private client: any;
  private storageClass: any;

  constructor(config: ConfigService) {
    this.projectId = config.get<string>('GCS_PROJECT_ID', '');
    this.keyFile = config.get<string>('GCS_KEY_FILE');
    this.publicUrl = config.get<string>('STORAGE_PUBLIC_URL');

    if (this.isAvailable()) {
      this.logger.log(`GCS configured (project=${this.projectId})`);
    } else {
      this.logger.warn('GCS selected but GCS_PROJECT_ID missing');
    }
  }

  isAvailable(): boolean {
    // keyFile is optional because GCS can use Application Default
    // Credentials (ADC) when running on GCP, so only projectId is
    // strictly required.
    return !!this.projectId;
  }

  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new StorageProviderNotConfiguredError('gcs', ['GCS_PROJECT_ID']);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@google-cloud/storage');
      this.storageClass = sdk.Storage;
      this.client = new sdk.Storage({
        projectId: this.projectId,
        keyFilename: this.keyFile,
      });
      this.sdkLoaded = true;
      this.logger.log('@google-cloud/storage loaded');
    } catch (e: any) {
      throw new Error(
        `GCS provider selected but "@google-cloud/storage" is not installed. ` +
          `Run: npm install @google-cloud/storage    Original: ${e.message}`,
      );
    }
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    options?: PutOptions,
  ): Promise<PutResult> {
    this.loadSdk();
    const file = this.client.bucket(bucket).file(key);
    await file.save(body, {
      contentType: options?.contentType,
      metadata: options?.metadata
        ? { metadata: options.metadata, cacheControl: options.cacheControl }
        : undefined,
      public: options?.acl === 'public',
    });
    return {
      path: key,
      url: this.getPublicUrl(bucket, key),
      size: body.length,
    };
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    this.loadSdk();
    const [contents] = await this.client.bucket(bucket).file(key).download();
    return contents as Buffer;
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.loadSdk();
    await this.client.bucket(bucket).file(key).delete({ ignoreNotFound: true });
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    this.loadSdk();
    const [exists] = await this.client.bucket(bucket).file(key).exists();
    return exists;
  }

  async list(bucket: string, prefix?: string): Promise<ListedObject[]> {
    this.loadSdk();
    const [files] = await this.client.bucket(bucket).getFiles({ prefix });
    return files.map((f: any) => ({
      key: f.name,
      size: Number(f.metadata.size) || 0,
      lastModified: new Date(f.metadata.updated || Date.now()),
    }));
  }

  getPublicUrl(bucket: string, key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
    }
    return `https://storage.googleapis.com/${bucket}/${key}`;
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    this.loadSdk();
    const [url] = await this.client.bucket(bucket).file(key).getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }
}
