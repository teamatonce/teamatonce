# Self-Hosted Migration Guide

This is the open-source self-hosted edition of Team@Once. The original codebase
depended on a proprietary all-in-one BaaS SDK; the migration replaces that
SDK with standard, self-hostable open-source infrastructure.

This guide tells you which pieces are **wired up and ready**, which are
**stubbed** and need provider credentials, and how to fill in the rest.

---

## What you need to run Team@Once

- **PostgreSQL 14+** (or any pg-compatible Postgres-as-a-service)
- **Node.js 18+**
- **Redis** (optional but recommended for sessions/cache)
- **An S3-compatible object storage** (any one of: AWS S3, Cloudflare R2, MinIO,
  Backblaze B2, DigitalOcean Spaces)
- **An SMTP provider** (any one of: Resend, SendGrid, Mailgun, AWS SES,
  Postmark, Gmail, self-hosted Postfix)
- **An LLM API key** (only if you want AI features: OpenAI, Anthropic, etc.)

---

## What's wired up out of the box

These are real implementations, not stubs:

### Database (`pg` + raw SQL)
- All CRUD operations through `DatabaseService.findOne / findMany / insert / update / delete / etc.`
- Chainable `QueryBuilder` for complex queries
- Run migrations: `psql $DATABASE_URL -f migrations/001_initial.sql`
  then `psql $DATABASE_URL -f migrations/002_auth_users.sql`

### Auth (`bcrypt` + `jsonwebtoken` + `users` table)
- `db.signUp / signIn / refreshSession / resetPassword / changePassword / verifyEmail`
- `db.auth.register / signIn / refreshToken / requestPasswordReset / changePassword / deleteUser`
- Password hashing with bcrypt (10 rounds, configurable)
- JWT access tokens (default 7d, configurable)
- Refresh token rotation stored in `auth_refresh_tokens` table
- Source: `src/modules/database/auth-helpers.ts`

Required env vars:
```
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=7d            # optional
REFRESH_TOKEN_EXPIRES_DAYS=30 # optional
BCRYPT_ROUNDS=10              # optional
```

### Storage (S3-compatible via `@aws-sdk/client-s3`)
- `db.uploadFile / downloadFile / deleteFileFromStorage / getPublicUrl / createSignedUrl`
- Works with S3, R2, MinIO, Spaces, B2, etc. out of the box
- Source: `src/modules/database/storage-helpers.ts`

Required env vars (Cloudflare R2 example):
```
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<your R2 access key>
STORAGE_SECRET_ACCESS_KEY=<your R2 secret key>
STORAGE_BUCKET_DEFAULT=teamatonce-uploads
STORAGE_PUBLIC_BASE_URL=https://cdn.your-domain.com  # optional, for getPublicUrl
```

For AWS S3:
```
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=<aws access key>
STORAGE_SECRET_ACCESS_KEY=<aws secret key>
STORAGE_BUCKET_DEFAULT=teamatonce-uploads
# leave STORAGE_ENDPOINT unset
```

For MinIO (self-hosted):
```
STORAGE_ENDPOINT=https://minio.your-domain.com
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_BUCKET_DEFAULT=teamatonce-uploads
STORAGE_FORCE_PATH_STYLE=true
```

### Email (SMTP via `nodemailer`)
- `db.sendEmail(to, subject, html, text?, options?)`
- Works with any SMTP provider
- Source: `src/modules/database/email-helpers.ts`

Required env vars (Resend example):
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=re_<your resend api key>
SMTP_FROM=Team@Once <noreply@your-domain.com>
```

For AWS SES:
```
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<ses smtp username>
SMTP_PASSWORD=<ses smtp password>
SMTP_FROM=noreply@your-verified-domain.com
```

---

## What's still stubbed (no-op until you wire it up)

These methods exist on `DatabaseService` so the codebase compiles, but they
log a warning at runtime and return empty/no-op results. Each one is a
clearly-marked drop-in point for a real implementation.

### AI (LLM features)
- `db.getAI()`, `db.generateText()`, `db.generateImage()`
- `db.client.ai.transcribeAudio / translateText / summarizeText / generateText`

To wire up: install your LLM provider's SDK and replace the stub method
bodies in `src/modules/database/database.service.ts`. Suggested providers:
- **OpenAI** (`openai` package — already installed)
- **Anthropic** (`@anthropic-ai/sdk`)
- **Google Gemini** (`@google/genai`)

The teamatonce AI services already have an `aiProvider` getter alias that
points at `db.getAI()`, so once `getAI()` returns a real client every
caller works automatically.

### Vector search (semantic search, embeddings)
- `db.ensureVectorCollection / upsertVectors / searchVectors / scrollVectors / deleteVectorsByFilter`

To wire up, pick one:
- **pgvector** — add `CREATE EXTENSION vector;` and an `embedding vector(1536)`
  column to relevant tables. No new service needed.
- **Qdrant** — `npm install @qdrant/js-client-rest` and replace the stubs
  with `QdrantClient` calls.
- **Pinecone** — `npm install @pinecone-database/pinecone`.

### Video conferencing
- `db.client.videoConferencing.createRoom / getRoom / generateToken / startRecording / ...`
- `db.getVideoJobStatus`, `db.downloadRecording`

To wire up: install `livekit-server-sdk` and implement `livekit-video.service.ts`
(currently has `type X = any` placeholders for the LiveKit types). Set:
```
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```

### Push notifications
- `db.sendPushNotification(to, title, body, data?)`

To wire up: install `firebase-admin`, register a service account, and
replace the stub with `admin.messaging().send(...)`. Or use OneSignal
(`onesignal-node`) or `web-push` for browser push.

### Realtime pub/sub
- `db.publishToChannel(channel, data)`, `db.unsubscribe(...)`

To wire up: use the existing `socket.io` setup (already wired in the
NestJS gateways) or wire Redis pub/sub for cross-instance broadcast.

### OAuth providers
- `db.auth.getOAuthUrl(provider, redirect)` returns an empty URL.

To wire up: implement OAuth flows directly in `AuthController` using
`passport-google-oauth20`, `passport-github2`, etc., and store the tokens
on the `users` row (`oauth_provider`, `oauth_provider_id` columns are
already in the schema).

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, STORAGE_*, SMTP_*

# 3. Run migrations
psql $DATABASE_URL -f migrations/001_initial.sql
psql $DATABASE_URL -f migrations/002_auth_users.sql

# 4. Start the backend
npm run start:dev
```

You should be able to register a user, log in, upload files, and receive
emails immediately. AI/video/vector/push features will log warnings until
you wire up the providers above.
