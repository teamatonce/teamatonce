# Video conferencing providers

Team@Once supports five video conferencing backends plus a `none` default.
Pick one by setting `VIDEO_PROVIDER` in your `.env`.

```
VIDEO_PROVIDER=jitsi   # default: none
```

## Comparison

| Provider | Free tier | Infra needed | Server SDK | Frontend SDK | Recording | Best for |
|---|---|---|---|---|---|---|
| **jitsi** *(default)* | ♾️ public meet.jit.si | none | none | `@jitsi/react-sdk` or `external_api.js` | JaaS / self-hosted only | *"I just want video that works."* |
| **whereby** | 100 min/month | none | none (pure REST) | `<iframe>` | host-initiated in UI | *"Easiest possible integration."* |
| **daily** | 10k min/month | none | none (pure REST) | `@daily-co/daily-js` or iframe | paid plan | *"Polished managed product."* |
| **livekit** | 50 min/month | none (cloud) or self-host | `livekit-server-sdk` | `livekit-client` | full egress to S3/R2 | *"Full control, OSS, recording."* |
| **agora** | 10k min/month | none | `agora-token` | `agora-rtc-sdk-ng` | separate Cloud Recording product | *"Battle-tested global scale, esp Asia."* |
| **none** | — | — | — | — | — | *default — video features disabled.* |

## Which should I pick?

- **Absolute easiest possible thing** → `whereby` (2 env vars, iframe frontend)
- **Zero signup, zero infra, zero cost** → `jitsi` (default — works with no config)
- **Polished managed product** → `daily`
- **Full features, OSS-friendly, self-hostable** → `livekit`
- **Battle-tested at global scale, strong in Asia** → `agora`

## Per-provider setup

### Jitsi (default)

No setup required. The default configuration points at the free public
`meet.jit.si` instance and everything (rooms, participants, screen share,
chat) just works. Rooms are URL-addressable and anyone with the URL can join.

For production with authenticated rooms, use
[Jitsi as a Service (JaaS)](https://jaas.8x8.vc/):

```
VIDEO_PROVIDER=jitsi
JITSI_DOMAIN=8x8.vc
JITSI_APP_ID=vpaas-magic-cookie-...
JITSI_PRIVATE_KEY=<PEM private key>
JITSI_KEY_ID=vpaas-magic-cookie-.../<key id>
```

Or self-host Jitsi and point `JITSI_DOMAIN` at your own server.

**Recording**: requires JaaS (paid) or a self-hosted Jibri. Not available on
`meet.jit.si`.

**Frontend**: load `https://<domain>/external_api.js` as a `<script>` or use
the `@jitsi/react-sdk` npm package.

### Whereby

Sign up at <https://whereby.com/org/signup>, grab an API key from
<https://whereby.com/org/YOUR_ORG/api>.

```
VIDEO_PROVIDER=whereby
WHEREBY_API_KEY=your-api-key
WHEREBY_ROOM_MODE=normal   # or "group" for large rooms with breakouts
```

**Frontend**: no SDK needed. Fetch the `joinUrl` and drop it in an `<iframe>`:

```tsx
<iframe
  src={joinUrl}
  allow="camera; microphone; fullscreen; display-capture; autoplay"
  style={{ width: '100%', height: 600, border: 0 }}
/>
```

**Recording**: started by the host from inside the embedded UI, not via API.

### Daily.co

Sign up at <https://dashboard.daily.co/>, grab an API key from the developers
page.

```
VIDEO_PROVIDER=daily
DAILY_API_KEY=your-api-key
DAILY_DOMAIN=your-subdomain    # from https://your-subdomain.daily.co
DAILY_RECORDING_ENABLED=false  # set true on paid plans
```

**Frontend**: `@daily-co/daily-js` (or the Daily Prebuilt iframe for zero-JS).

**Recording**: enabled on paid plans; call `startRecording()` client-side via
`daily-js`. Server-side API is plan-gated.

### LiveKit

Sign up at <https://livekit.io/cloud> or self-host with the LiveKit Docker
image.

```
VIDEO_PROVIDER=livekit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_WEBHOOK_SECRET=
LIVEKIT_RECORDING_BUCKET=    # optional; defaults to STORAGE_BUCKET
```

The `livekit-server-sdk` package is declared as an **optional dependency** —
it is lazy-loaded only when `VIDEO_PROVIDER=livekit`. If you pick another
provider, you never install the LiveKit SDK.

**Frontend**: `livekit-client`.

**Recording**: full egress-to-S3 support using the same `STORAGE_*` env vars
as the rest of the app (works with S3 / R2 / MinIO / B2).

### Agora

Sign up at <https://console.agora.io/>, enable App Certificate, copy both
values.

```
VIDEO_PROVIDER=agora
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_TOKEN_TTL=86400
```

The `agora-token` package is declared as an **optional dependency** — only
installed when you actually pick Agora.

**Frontend**: `agora-rtc-sdk-ng`. Clients join a "channel" using the App ID +
the token from `generateToken()` + a uint32 uid (the backend hashes the
user's string identity to a stable uid).

**Recording**: Agora Cloud Recording is a separate product with its own
REST API and pricing — the provider throws `VideoProviderNotSupportedError`
on `startRecording()` with a link to the docs.

### None (default when unset)

Every method throws `VideoProviderNotConfiguredError`. The frontend should
read `/api/v1/video/sdk-info` and hide all call-related UI when the
provider is reported as `"none"`.

## Adding a new provider

1. Implement `VideoProvider` in
   `backend/src/modules/teamatonce/communication/providers/<name>.provider.ts`
2. Add a case to `createVideoProvider()` in `providers/index.ts`
3. Document env vars here and in `.env.example`
4. If the provider needs an SDK, add it to `optionalDependencies` in
   `backend/package.json` and `require()` it inside `loadSdk()`, not at the
   top of the file.
