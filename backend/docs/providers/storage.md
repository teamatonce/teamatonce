# Storage providers

Vasty Shop supports eight file storage backends plus a `none` default.
Pick one by setting `STORAGE_PROVIDER` in your `.env`.

```
STORAGE_PROVIDER=local-fs   # zero-infra default
```

## Comparison

| Provider | Free tier | Infra needed | Package | Signed URLs | Best for |
|---|---|---|---|---|---|
| **local-fs** *(recommended default for dev)* | ♾️ | none | built-in | HMAC-signed | getting started, small self-hosted |
| **s3** | 5GB free tier for 12 mo | AWS account | `@aws-sdk/client-s3` | native | US/EU/global, scale |
| **r2** *(current hardcoded impl)* | 10GB free forever | Cloudflare account | `@aws-sdk/client-s3` | native | cheap egress |
| **minio** | ♾️ | self-host MinIO | `@aws-sdk/client-s3` | native | private cloud, homelab |
| **b2** | 10GB free | Backblaze account | `@aws-sdk/client-s3` | native | cheapest egress of the big names |
| **gcs** | 5GB free | GCP account | `@google-cloud/storage` *(optional)* | native | GCP deployments |
| **azure** | 5GB free for 12 mo | Azure account | `@azure/storage-blob` *(optional)* | native | Azure deployments |
| **none** | — | — | — | — | default — storage features disabled |

## Which should I pick?

- **"I just cloned the repo, I don't have any cloud accounts"** → `local-fs` (zero infra, writes under `./data/uploads`)
- **Small self-hosted production** → `local-fs` or `minio` (both self-hosted, no vendor lock-in)
- **Existing Cloudflare setup** → `r2` (cheapest egress, S3-compatible)
- **Already on AWS** → `s3`
- **Already on GCP** → `gcs`
- **Already on Azure** → `azure`

## Per-provider setup

### local-fs (recommended default)

No setup required. Uploads go to `./data/uploads/<bucket>/<key>` on the
backend host. A companion static-serve route (wired up by the follow-up
install PR) serves them at `LOCAL_FS_PUBLIC_URL` (default `/uploads`).

```
STORAGE_PROVIDER=local-fs
LOCAL_FS_PATH=./data/uploads
LOCAL_FS_PUBLIC_URL=/uploads
LOCAL_FS_SIGNING_KEY=replace-with-a-long-random-string
```

**Signed URLs**: HMAC-SHA256 over `<bucket>/<key>:<expiresAt>`. The
internal static-serve route validates the `?exp=` and `?sig=` query
params before streaming the file.

**Persistence warning**: files live on the backend container's
filesystem. Mount `./data/uploads` to a named Docker volume in
production so they survive container rebuilds.

**Path traversal**: rejected at put/get/delete time. Any key containing
`..` that resolves outside the bucket directory raises an error.

### s3 (AWS)

Create a bucket, an IAM user with `s3:PutObject` / `GetObject` /
`DeleteObject` / `ListBucket` on it, copy the keys.

```
STORAGE_PROVIDER=s3
STORAGE_BUCKET=my-vasty-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIA...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_PUBLIC_URL=https://cdn.example.com   # optional: CDN override
```

### r2 (Cloudflare)

Grab an R2 access key from the Cloudflare dashboard. You have two
equivalent ways to configure it:

**Option A — new `STORAGE_*` layout (recommended):**
```
STORAGE_PROVIDER=r2
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-bucket
STORAGE_PUBLIC_URL=https://cdn.example.com
```

**Option B — legacy `R2_*` layout (backwards compatible):**
```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://cdn.example.com
```

If you leave `STORAGE_PROVIDER` unset but the `R2_*` vars exist, the
factory auto-infers `r2` to keep existing `.env` files working. A
deprecation warning is logged — plan to rename.

### minio (self-hosted)

Run MinIO in Docker (via the provided `--profile minio` compose profile
once install PR #24 lands, or any `minio/minio` image). Default admin
creds on a fresh dev install: `minioadmin` / `minioadmin`.

```
STORAGE_PROVIDER=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_BUCKET=vasty-dev
STORAGE_FORCE_PATH_STYLE=true        # required for localhost MinIO
```

### b2 (Backblaze)

Create an application key with access to your bucket.

```
STORAGE_PROVIDER=b2
STORAGE_REGION=us-west-002
STORAGE_ENDPOINT=https://s3.us-west-002.backblazeb2.com
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_BUCKET=my-bucket
```

### gcs (Google Cloud Storage)

`@google-cloud/storage` is in **optionalDependencies**. When you run
`npm install` with `STORAGE_PROVIDER=gcs`, npm installs it
automatically. If you pick a different provider, it's never downloaded.

```
STORAGE_PROVIDER=gcs
GCS_PROJECT_ID=your-project
GCS_KEY_FILE=/path/to/service-account.json    # or rely on ADC
STORAGE_BUCKET=your-bucket
```

### azure (Azure Blob Storage)

`@azure/storage-blob` is in **optionalDependencies**.

```
STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
STORAGE_BUCKET=my-container
```

> ⚠️ The current Azure provider returns the public URL from
> `getSignedUrl` instead of a real SAS token. For private containers,
> implement `generateBlobSASQueryParameters` as a follow-up.

### none (default when no provider is set)

Every method throws `StorageProviderNotConfiguredError`. The startup
log prints exactly which env var to set to enable storage.

## Adding a new provider

1. Implement `StorageProvider` in
   `backend/src/modules/storage/providers/<name>.provider.ts`
2. Add a case to `createStorageProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. If the provider needs an SDK, declare it in `optionalDependencies`
   in `backend/package.json` and `require()` it inside a `loadSdk()`
   method — never at the top of the file. See `gcs.provider.ts` for
   the pattern.
