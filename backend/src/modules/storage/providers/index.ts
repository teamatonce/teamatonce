/**
 * Storage provider factory.
 *
 * Reads STORAGE_PROVIDER from config and returns the matching provider.
 * Also provides a legacy shim: if STORAGE_PROVIDER is unset but the old
 * R2_* env vars are present, we default to 'r2' so existing vasty-shop
 * .env files keep working without the operator having to touch anything.
 *
 * Add a new provider by:
 *   1. Implementing StorageProvider in <name>.provider.ts
 *   2. Adding a case to createStorageProvider() below
 *   3. Documenting env vars in docs/providers/storage.md
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { StorageProvider } from './storage-provider.interface';
import { LocalFsProvider } from './local-fs.provider';
import { S3Provider } from './s3.provider';
import { GcsProvider } from './gcs.provider';
import { AzureProvider } from './azure.provider';
import { NoneStorageProvider } from './none.provider';

const log = new Logger('StorageProviderFactory');

export function createStorageProvider(config: ConfigService): StorageProvider {
  let choice = (
    config.get<string>('STORAGE_PROVIDER') || ''
  )
    .toLowerCase()
    .trim();

  // Legacy shim: if no STORAGE_PROVIDER but R2 env vars exist, infer r2.
  if (!choice) {
    const hasLegacyR2 =
      !!config.get<string>('R2_ACCOUNT_ID') &&
      !!config.get<string>('R2_ACCESS_KEY_ID') &&
      !!config.get<string>('R2_SECRET_ACCESS_KEY');
    if (hasLegacyR2) {
      log.log(
        'STORAGE_PROVIDER unset but legacy R2_* env vars detected — using "r2" for backwards compatibility. Consider renaming to STORAGE_*.',
      );
      choice = 'r2';
    } else {
      choice = 'none';
    }
  }

  switch (choice) {
    case 'local-fs':
    case 'local':
    case 'fs':
    case 'filesystem': {
      const p = new LocalFsProvider(config);
      log.log(`Selected storage provider: local-fs (available=${p.isAvailable()})`);
      return p;
    }
    case 's3':
    case 'aws':
    case 'aws-s3': {
      const p = new S3Provider(config, 's3');
      log.log(`Selected storage provider: s3 (available=${p.isAvailable()})`);
      return p;
    }
    case 'r2':
    case 'cloudflare':
    case 'cloudflare-r2': {
      const p = new S3Provider(config, 'r2');
      log.log(`Selected storage provider: r2 (available=${p.isAvailable()})`);
      return p;
    }
    case 'minio': {
      const p = new S3Provider(config, 'minio');
      log.log(`Selected storage provider: minio (available=${p.isAvailable()})`);
      return p;
    }
    case 'b2':
    case 'backblaze':
    case 'backblaze-b2': {
      const p = new S3Provider(config, 'b2');
      log.log(`Selected storage provider: b2 (available=${p.isAvailable()})`);
      return p;
    }
    case 'gcs':
    case 'google':
    case 'google-cloud':
    case 'google-cloud-storage': {
      const p = new GcsProvider(config);
      log.log(`Selected storage provider: gcs (available=${p.isAvailable()})`);
      return p;
    }
    case 'azure':
    case 'azure-blob':
    case 'azure-storage': {
      const p = new AzureProvider(config);
      log.log(`Selected storage provider: azure (available=${p.isAvailable()})`);
      return p;
    }
    case 'none':
    case '':
      return new NoneStorageProvider();
    default:
      log.warn(
        `Unknown STORAGE_PROVIDER="${choice}". Falling back to "none". Valid values: local-fs, s3, r2, minio, b2, gcs, azure, none.`,
      );
      return new NoneStorageProvider();
  }
}

export * from './storage-provider.interface';
export { LocalFsProvider } from './local-fs.provider';
export { S3Provider } from './s3.provider';
export { GcsProvider } from './gcs.provider';
export { AzureProvider } from './azure.provider';
export { NoneStorageProvider } from './none.provider';
