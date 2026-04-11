/**
 * Azure Blob Storage provider.
 *
 *   STORAGE_PROVIDER=azure
 *   AZURE_STORAGE_CONNECTION_STRING=...
 *   STORAGE_BUCKET=my-container      (Azure calls buckets "containers")
 *
 * The `@azure/storage-blob` package is an OPTIONAL dependency — lazy-loaded
 * inside loadSdk() only when the provider is selected, and declared in
 * optionalDependencies in package.json.
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

export class AzureProvider implements StorageProvider {
  readonly name = 'azure' as const;
  private readonly logger = new Logger('AzureProvider');

  private readonly connectionString: string;
  private readonly publicUrl?: string;

  private sdkLoaded = false;
  private client: any;

  constructor(config: ConfigService) {
    this.connectionString = config.get<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
      '',
    );
    this.publicUrl = config.get<string>('STORAGE_PUBLIC_URL');

    if (this.isAvailable()) {
      this.logger.log('Azure Blob configured');
    } else {
      this.logger.warn(
        'Azure provider selected but AZURE_STORAGE_CONNECTION_STRING missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.connectionString;
  }

  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new StorageProviderNotConfiguredError('azure', [
        'AZURE_STORAGE_CONNECTION_STRING',
      ]);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@azure/storage-blob');
      this.client = sdk.BlobServiceClient.fromConnectionString(
        this.connectionString,
      );
      this.sdkLoaded = true;
      this.logger.log('@azure/storage-blob loaded');
    } catch (e: any) {
      throw new Error(
        `Azure provider selected but "@azure/storage-blob" is not installed. ` +
          `Run: npm install @azure/storage-blob    Original: ${e.message}`,
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
    const containerClient = this.client.getContainerClient(bucket);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    await blockBlobClient.uploadData(body, {
      blobHTTPHeaders: {
        blobContentType: options?.contentType ?? 'application/octet-stream',
        blobCacheControl: options?.cacheControl,
      },
      metadata: options?.metadata,
    });
    return {
      path: key,
      url: this.getPublicUrl(bucket, key),
      size: body.length,
    };
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    this.loadSdk();
    const blobClient = this.client.getContainerClient(bucket).getBlobClient(key);
    return await blobClient.downloadToBuffer();
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.loadSdk();
    await this.client
      .getContainerClient(bucket)
      .getBlobClient(key)
      .deleteIfExists();
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    this.loadSdk();
    return await this.client
      .getContainerClient(bucket)
      .getBlobClient(key)
      .exists();
  }

  async list(bucket: string, prefix?: string): Promise<ListedObject[]> {
    this.loadSdk();
    const out: ListedObject[] = [];
    const containerClient = this.client.getContainerClient(bucket);
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      out.push({
        key: blob.name,
        size: Number(blob.properties.contentLength) || 0,
        lastModified: blob.properties.lastModified ?? new Date(),
      });
    }
    return out;
  }

  getPublicUrl(bucket: string, key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
    }
    // Best-effort synth from the connection string's account name.
    const accountMatch = /AccountName=([^;]+)/.exec(this.connectionString);
    const account = accountMatch?.[1] ?? 'unknown';
    return `https://${account}.blob.core.windows.net/${bucket}/${key}`;
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    // Generating SAS tokens requires the shared key credential, which
    // the connection string gives us. For now we return the public URL —
    // callers that need real SAS can implement `generateBlobSASQueryParameters`
    // as a follow-up.
    this.loadSdk();
    return this.getPublicUrl(bucket, key);
  }
}
