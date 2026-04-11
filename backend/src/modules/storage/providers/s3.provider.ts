/**
 * S3-compatible storage provider.
 *
 * Handles AWS S3 and every S3-compatible service (Cloudflare R2, MinIO,
 * Backblaze B2) via the same @aws-sdk/client-s3 codepath. The "flavor"
 * just changes the endpoint URL.
 *
 *   STORAGE_PROVIDER=s3     -> AWS S3 (no endpoint override)
 *   STORAGE_PROVIDER=r2     -> Cloudflare R2 (endpoint: https://<account>.r2.cloudflarestorage.com)
 *   STORAGE_PROVIDER=minio  -> requires STORAGE_ENDPOINT (e.g. http://localhost:9000)
 *   STORAGE_PROVIDER=b2     -> Backblaze B2 (endpoint: https://s3.<region>.backblazeb2.com)
 *
 * Required env vars:
 *   STORAGE_ACCESS_KEY_ID
 *   STORAGE_SECRET_ACCESS_KEY
 *   STORAGE_BUCKET           - the default bucket (individual put/get calls
 *                              still take a bucket, but this is the one the
 *                              app uses when callers don't specify)
 *
 * Optional env vars:
 *   STORAGE_REGION           - default 'auto' (works for R2), 'us-east-1' for AWS
 *   STORAGE_ENDPOINT         - override endpoint (required for MinIO, optional
 *                              for R2 if R2_ACCOUNT_ID is set instead)
 *   STORAGE_PUBLIC_URL       - CDN / public URL prefix for getPublicUrl()
 *   STORAGE_FORCE_PATH_STYLE - 'true' for MinIO (virtual-host style doesn't
 *                              work with localhost); default false
 *
 * Legacy env var shim:
 *   If R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY are set
 *   (the pre-adapter vasty-shop layout), this provider reads them when
 *   STORAGE_PROVIDER=r2 and the STORAGE_* equivalents are unset. That way
 *   existing .env files keep working during the transition.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ListedObject,
  PutOptions,
  PutResult,
  StorageProvider,
  StorageProviderNotConfiguredError,
} from './storage-provider.interface';

export type S3Flavor = 's3' | 'r2' | 'minio' | 'b2';

export class S3Provider implements StorageProvider {
  readonly name: S3Flavor;
  private readonly logger: Logger;

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly publicUrl?: string;
  private readonly forcePathStyle: boolean;

  private client?: S3Client;

  constructor(config: ConfigService, flavor: S3Flavor) {
    this.name = flavor;
    this.logger = new Logger(`S3Provider(${flavor})`);

    // Pull STORAGE_* with legacy R2_* fallback for flavor=r2 only.
    const getS = <T = string>(key: string, def?: T) =>
      config.get<T>(key, def as T);

    this.accessKeyId =
      getS<string>('STORAGE_ACCESS_KEY_ID', '') ||
      (flavor === 'r2' ? getS<string>('R2_ACCESS_KEY_ID', '') : '');
    this.secretAccessKey =
      getS<string>('STORAGE_SECRET_ACCESS_KEY', '') ||
      (flavor === 'r2' ? getS<string>('R2_SECRET_ACCESS_KEY', '') : '');
    this.region = getS<string>('STORAGE_REGION', 'auto');
    this.publicUrl =
      getS<string>('STORAGE_PUBLIC_URL') ||
      (flavor === 'r2' ? getS<string>('R2_PUBLIC_URL') : undefined) ||
      undefined;
    this.forcePathStyle =
      String(getS<string>('STORAGE_FORCE_PATH_STYLE', 'false')).toLowerCase() ===
      'true';

    // Endpoint resolution per-flavor:
    let endpoint = getS<string>('STORAGE_ENDPOINT') || undefined;
    if (!endpoint && flavor === 'r2') {
      const accountId =
        getS<string>('R2_ACCOUNT_ID') || getS<string>('STORAGE_ACCOUNT_ID');
      if (accountId) {
        endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      }
    }
    this.endpoint = endpoint;

    if (this.isAvailable()) {
      this.logger.log(
        `${flavor} configured (endpoint=${this.endpoint ?? '[aws default]'})`,
      );
    } else {
      this.logger.warn(
        `${flavor} selected but credentials missing (STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY)`,
      );
    }
  }

  isAvailable(): boolean {
    if (!this.accessKeyId || !this.secretAccessKey) return false;
    if (this.name === 'minio' && !this.endpoint) return false;
    return true;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!this.isAvailable()) {
      throw new StorageProviderNotConfiguredError(this.name, this.missingVars());
    }
    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle:
        this.forcePathStyle || this.name === 'minio' ? true : undefined,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
    return this.client;
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.accessKeyId) out.push('STORAGE_ACCESS_KEY_ID');
    if (!this.secretAccessKey) out.push('STORAGE_SECRET_ACCESS_KEY');
    if (this.name === 'minio' && !this.endpoint) out.push('STORAGE_ENDPOINT');
    return out;
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    options?: PutOptions,
  ): Promise<PutResult> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType ?? 'application/octet-stream',
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl,
        ACL: options?.acl === 'public' ? 'public-read' : undefined,
      }),
    );
    return {
      path: key,
      url: this.getPublicUrl(bucket, key),
      size: body.length,
    };
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    const res = await this.getClient().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = res.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.getClient().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return true;
    } catch (e: any) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw e;
    }
  }

  async list(bucket: string, prefix?: string): Promise<ListedObject[]> {
    const res = await this.getClient().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
    );
    return (res.Contents || []).map((o) => ({
      key: o.Key || '',
      size: o.Size || 0,
      lastModified: o.LastModified || new Date(),
    }));
  }

  getPublicUrl(bucket: string, key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
    }
    // Fallback: synthesize a URL from the endpoint. Not all S3-compatible
    // backends expose objects publicly by default, so this is best-effort.
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/+$/, '')}/${bucket}/${key}`;
    }
    // AWS S3 virtual-hosted style
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: expiresInSeconds,
    });
  }
}
