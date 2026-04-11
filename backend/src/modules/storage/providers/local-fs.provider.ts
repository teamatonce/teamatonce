/**
 * Local filesystem storage provider.
 *
 * THIS IS THE EASIEST OPTION FOR ANYONE SETTING UP VASTY-SHOP TODAY:
 *
 *   STORAGE_PROVIDER=local-fs
 *
 * That's it. With zero other config, uploaded files are written under
 * ./data/uploads (or $LOCAL_FS_PATH), organized by bucket, and served via
 * an internal static route. No S3 credentials, no bucket creation, no
 * cloud signup. Perfect for dev, small self-hosted deployments, and
 * contributors who just cloned the repo 2 minutes ago.
 *
 * Env vars:
 *   LOCAL_FS_PATH        - Base directory (default ./data/uploads)
 *   LOCAL_FS_PUBLIC_URL  - URL prefix the frontend uses to fetch files.
 *                          Defaults to "/uploads". The backend should
 *                          serve LOCAL_FS_PATH at this URL via a static
 *                          route.
 *   LOCAL_FS_SIGNING_KEY - Secret for HMAC-signing short-lived URLs.
 *                          Auto-generated if not set (per-process; change
 *                          means signed URLs from old processes become
 *                          invalid).
 *
 * Signed URLs use HMAC-SHA256 over "bucket/key:expiresAt" and add
 * `?exp=<timestamp>&sig=<signature>` to the URL. An internal controller
 * should validate these before serving private files.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ListedObject,
  PutOptions,
  PutResult,
  StorageProvider,
} from './storage-provider.interface';

export class LocalFsProvider implements StorageProvider {
  readonly name = 'local-fs' as const;
  private readonly logger = new Logger('LocalFsProvider');

  private readonly basePath: string;
  private readonly publicUrlPrefix: string;
  private readonly signingKey: string;

  constructor(config: ConfigService) {
    this.basePath = path.resolve(
      config.get<string>('LOCAL_FS_PATH', './data/uploads'),
    );
    this.publicUrlPrefix = config
      .get<string>('LOCAL_FS_PUBLIC_URL', '/uploads')
      .replace(/\/+$/, '');
    this.signingKey =
      config.get<string>('LOCAL_FS_SIGNING_KEY') ??
      crypto.randomBytes(32).toString('hex');

    // Ensure the base directory exists.
    try {
      fs.mkdirSync(this.basePath, { recursive: true });
      this.logger.log(
        `LocalFs provider: ${this.basePath} served at ${this.publicUrlPrefix}`,
      );
    } catch (e: any) {
      this.logger.warn(
        `LocalFs provider: failed to create base path ${this.basePath}: ${e.message}`,
      );
    }
  }

  isAvailable(): boolean {
    // LocalFs is always available — writing is just fs.writeFile. If the
    // base path is unwritable, the first put() will throw with a real
    // error anyway.
    try {
      fs.accessSync(this.basePath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a bucket + key to an absolute filesystem path inside basePath.
   * Rejects any key that tries to escape via '..'.
   */
  private resolvePath(bucket: string, key: string): string {
    const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const joined = path.resolve(this.basePath, safeBucket, key);
    const prefix = path.resolve(this.basePath, safeBucket);
    if (!joined.startsWith(prefix + path.sep) && joined !== prefix) {
      throw new Error(`Rejected path traversal in storage key: ${key}`);
    }
    return joined;
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    options?: PutOptions,
  ): Promise<PutResult> {
    const fullPath = this.resolvePath(bucket, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);

    // Store contentType + metadata alongside the file as JSON sidecar
    // so get() can serve it with the right headers.
    if (options?.contentType || options?.metadata) {
      fs.writeFileSync(
        fullPath + '.meta.json',
        JSON.stringify(
          {
            contentType: options?.contentType ?? 'application/octet-stream',
            metadata: options?.metadata ?? {},
            cacheControl: options?.cacheControl,
            acl: options?.acl ?? 'public',
          },
          null,
          2,
        ),
      );
    }

    return {
      path: key,
      url: this.getPublicUrl(bucket, key),
      size: body.length,
    };
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolvePath(bucket, key));
  }

  async delete(bucket: string, key: string): Promise<void> {
    const fullPath = this.resolvePath(bucket, key);
    try {
      fs.unlinkSync(fullPath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    // Clean up sidecar if it exists.
    try {
      fs.unlinkSync(fullPath + '.meta.json');
    } catch {
      /* ignore */
    }
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      fs.accessSync(this.resolvePath(bucket, key));
      return true;
    } catch {
      return false;
    }
  }

  async list(bucket: string, prefix?: string): Promise<ListedObject[]> {
    const rootDir = this.resolvePath(bucket, prefix ?? '');
    const out: ListedObject[] = [];
    const walk = (dir: string, rel: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.endsWith('.meta.json')) continue;
        const abs = path.join(dir, entry.name);
        const key = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(abs, key);
        } else {
          const stat = fs.statSync(abs);
          out.push({
            key: (prefix ? `${prefix}/${key}` : key).replace(/^\/+/, ''),
            size: stat.size,
            lastModified: stat.mtime,
          });
        }
      }
    };
    walk(rootDir, '');
    return out;
  }

  getPublicUrl(bucket: string, key: string): string {
    const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.publicUrlPrefix}/${safeBucket}/${key.replace(/^\/+/, '')}`;
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${bucket}/${key}:${expiresAt}`;
    const sig = crypto
      .createHmac('sha256', this.signingKey)
      .update(payload)
      .digest('hex');
    const base = this.getPublicUrl(bucket, key);
    return `${base}?exp=${expiresAt}&sig=${sig}`;
  }

  /**
   * Verify a signed URL. Exposed for the static-serve controller that
   * validates incoming ?exp + ?sig query params before reading the file.
   */
  verifySignature(
    bucket: string,
    key: string,
    expiresAt: number,
    sig: string,
  ): boolean {
    if (Math.floor(Date.now() / 1000) > expiresAt) return false;
    const expected = crypto
      .createHmac('sha256', this.signingKey)
      .update(`${bucket}/${key}:${expiresAt}`)
      .digest('hex');
    // Constant-time compare
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(sig),
      );
    } catch {
      return false;
    }
  }
}
