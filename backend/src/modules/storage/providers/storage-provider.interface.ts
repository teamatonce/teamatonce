/**
 * Common interface that every storage provider implements.
 *
 * Pick a provider by setting STORAGE_PROVIDER in your .env to one of:
 *
 *   local-fs - Local filesystem. Writes under ./data/uploads, serves via an
 *              internal static route. Zero infra, zero signup, zero config.
 *              The default and recommended starting point for dev.
 *
 *   s3       - AWS S3. Requires STORAGE_ACCESS_KEY_ID + STORAGE_SECRET_ACCESS_KEY
 *              + STORAGE_BUCKET (+ STORAGE_REGION).
 *
 *   r2       - Cloudflare R2. Same as s3 but with R2's endpoint autowired
 *              from STORAGE_ENDPOINT or R2_ACCOUNT_ID.
 *
 *   minio    - MinIO self-hosted S3-compatible. Same as s3 but with
 *              STORAGE_ENDPOINT pointing at your MinIO server.
 *
 *   b2       - Backblaze B2 S3-compatible. Same as s3 but with the B2
 *              endpoint.
 *
 *   gcs      - Google Cloud Storage. Requires @google-cloud/storage
 *              (optional dependency, lazy-loaded).
 *
 *   azure    - Azure Blob Storage. Requires @azure/storage-blob (optional
 *              dependency, lazy-loaded).
 *
 *   none     - Storage disabled. Every method throws loud errors.
 *              The default if STORAGE_PROVIDER is unset AND no legacy
 *              R2_* env vars are detected.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/storage.md.
 */

export interface PutOptions {
  /** MIME type. Default 'application/octet-stream'. */
  contentType?: string;
  /** Arbitrary user metadata attached to the object. */
  metadata?: Record<string, string>;
  /** Cache-Control header. */
  cacheControl?: string;
  /** 'public' | 'private' access control (provider-dependent). */
  acl?: 'public' | 'private';
}

export interface PutResult {
  /** The path the file was written to (bucket-relative key). */
  path: string;
  /** A URL the user can open — public CDN URL or signed URL if private. */
  url: string;
  /** Size in bytes (when known). */
  size?: number;
  /** Provider-specific ETag or version id. */
  etag?: string;
}

export interface ListedObject {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * Common interface implemented by every storage provider.
 * Methods a provider can't support should throw a clear
 * StorageProviderNotSupportedError — never silently no-op.
 */
export interface StorageProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'local-fs'
    | 's3'
    | 'r2'
    | 'minio'
    | 'b2'
    | 'gcs'
    | 'azure'
    | 'none';

  /** True if the provider has the credentials it needs to function. */
  isAvailable(): boolean;

  /** Write a file. */
  put(bucket: string, key: string, body: Buffer, options?: PutOptions): Promise<PutResult>;

  /** Read a file as a Buffer. */
  get(bucket: string, key: string): Promise<Buffer>;

  /** Delete a file. */
  delete(bucket: string, key: string): Promise<void>;

  /** Check if an object exists. Must not throw on missing — return false. */
  exists(bucket: string, key: string): Promise<boolean>;

  /** List objects in a bucket, optionally under a prefix. */
  list(bucket: string, prefix?: string): Promise<ListedObject[]>;

  /** Get a permanent public URL (CDN / public bucket). */
  getPublicUrl(bucket: string, key: string): string;

  /** Get a short-lived signed URL that grants read access without auth. */
  getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
}

/**
 * Thrown when a provider is asked to do something it can't support on the
 * current backend (e.g. permanent public URLs on a private bucket with no CDN).
 */
export class StorageProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" storage provider. See docs/providers/storage.md for provider capabilities.`,
    );
    this.name = 'StorageProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class StorageProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Storage provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/storage.md.`,
    );
    this.name = 'StorageProviderNotConfiguredError';
  }
}
