/**
 * Real S3-compatible object storage helpers (works with AWS S3, Cloudflare R2,
 * MinIO, Backblaze B2, DigitalOcean Spaces, etc.).
 *
 * Replaces the fluxez SDK storage stubs with concrete implementations using
 * @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
 *
 * Required env vars:
 *   STORAGE_ENDPOINT          (e.g. https://<account>.r2.cloudflarestorage.com)
 *   STORAGE_REGION            (e.g. auto for R2, us-east-1 for AWS)
 *   STORAGE_ACCESS_KEY_ID
 *   STORAGE_SECRET_ACCESS_KEY
 *   STORAGE_BUCKET_DEFAULT    (default bucket if caller doesn't specify)
 *   STORAGE_PUBLIC_BASE_URL   (optional - public URL prefix for getPublicUrl)
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface StorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  defaultBucket?: string;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
}

export function getStorageConfig(getConfig: (key: string, fallback?: any) => any): StorageConfig {
  return {
    endpoint: getConfig('STORAGE_ENDPOINT') || undefined,
    region: getConfig('STORAGE_REGION', 'auto'),
    accessKeyId: getConfig('STORAGE_ACCESS_KEY_ID', ''),
    secretAccessKey: getConfig('STORAGE_SECRET_ACCESS_KEY', ''),
    defaultBucket: getConfig('STORAGE_BUCKET_DEFAULT') || undefined,
    publicBaseUrl: getConfig('STORAGE_PUBLIC_BASE_URL') || undefined,
    forcePathStyle: String(getConfig('STORAGE_FORCE_PATH_STYLE', 'false')).toLowerCase() === 'true',
  };
}

let cachedClient: S3Client | null = null;

export function getStorageClient(cfg: StorageConfig): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });
  return cachedClient;
}

export async function uploadFileFn(
  cfg: StorageConfig,
  bucket: string,
  fileBuffer: Buffer,
  path: string,
  options?: { contentType?: string; metadata?: Record<string, string>; cacheControl?: string },
): Promise<{ path: string; url: string; key: string; bucket: string }> {
  const client = getStorageClient(cfg);
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  await client.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: path,
      Body: fileBuffer,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
      CacheControl: options?.cacheControl,
    }),
  );
  const url = getPublicUrlFn(cfg, targetBucket, path);
  return { path, url, key: path, bucket: targetBucket };
}

export async function downloadFileFn(
  cfg: StorageConfig,
  bucket: string,
  path: string,
): Promise<Buffer> {
  const client = getStorageClient(cfg);
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  const result = await client.send(
    new GetObjectCommand({ Bucket: targetBucket, Key: path }),
  );
  const stream = result.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteFileFn(
  cfg: StorageConfig,
  bucket: string,
  path: string,
): Promise<void> {
  const client = getStorageClient(cfg);
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  await client.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: path }));
}

export function getPublicUrlFn(cfg: StorageConfig, bucket: string, path: string): string {
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  if (cfg.publicBaseUrl) {
    const base = cfg.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${path}`;
  }
  if (cfg.endpoint) {
    const base = cfg.endpoint.replace(/\/$/, '');
    return `${base}/${targetBucket}/${path}`;
  }
  return `https://${targetBucket}.s3.${cfg.region}.amazonaws.com/${path}`;
}

export async function createSignedUrlFn(
  cfg: StorageConfig,
  bucket: string,
  path: string,
  expiresIn: number = 3600,
): Promise<string> {
  const client = getStorageClient(cfg);
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: targetBucket, Key: path }),
    { expiresIn },
  );
}

export async function fileExistsFn(
  cfg: StorageConfig,
  bucket: string,
  path: string,
): Promise<boolean> {
  const client = getStorageClient(cfg);
  const targetBucket = bucket || cfg.defaultBucket || 'uploads';
  try {
    await client.send(new HeadObjectCommand({ Bucket: targetBucket, Key: path }));
    return true;
  } catch (e: any) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}
