# Auth / SSO providers

Team@Once supports pluggable auth providers controlled by the
`AUTH_PROVIDERS` env var. The frontend reads `GET /auth/providers` on
page load and renders login buttons for whichever providers are
enabled in the deployment.

```
AUTH_PROVIDERS=local,google,github,magic-link
```

`local` (email + password) is always enabled — you don't need to list
it, the registry auto-adds it.

## Implemented in this PR (#31)

| Provider | Status | Env vars |
|---|---|---|
| **local** *(baseline)* | ready | (none — uses JWT_SECRET + database) |
| **google** | ready | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` |
| **github** | ready | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` |
| **magic-link** | ready *(NEW)* | `MAGIC_LINK_TTL_SECONDS` (optional, default 900) |

Google and GitHub already existed in Team@Once as passport strategies —
this PR adds them to the central registry so the frontend can discover
them without hardcoding. Magic Link is net-new.

## Planned follow-ups

| Provider | Status | Notes |
|---|---|---|
| **gitlab** | planned | trivial follow-up — same OAuth2 shape as GitHub |
| **keycloak** | planned | OIDC compliant, good for self-hosted IAM |
| **clerk** | planned | managed auth, JWT verification only |
| **auth0** | planned | managed auth, OIDC |

Listing any of these in `AUTH_PROVIDERS` today logs a warning and
they're dropped from the enabled list — not silently skipped.

## Frontend endpoint

```
GET /api/v1/auth/providers
```

Returns the enabled list the frontend uses to render login buttons:

```json
{
  "providers": [
    { "key": "local", "displayName": "Email & Password", "enabled": true, "implemented": true, "icon": "mail" },
    { "key": "google", "displayName": "Google", "enabled": true, "implemented": true, "authorizationPath": "/api/v1/auth/oauth/google", "icon": "google" },
    { "key": "github", "displayName": "GitHub", "enabled": true, "implemented": true, "authorizationPath": "/api/v1/auth/oauth/github", "icon": "github" },
    { "key": "magic-link", "displayName": "Magic Link", "enabled": true, "implemented": true, "authorizationPath": "/api/v1/auth/magic-link/request", "icon": "link" }
  ]
}
```

The frontend should:
1. Call this once on login-page mount
2. Render one button per entry, using `icon` to pick the svg and
   `displayName` as the label
3. Clicking an OAuth button navigates to `authorizationPath`
4. Clicking magic-link opens an email input + calls the request endpoint

## Magic Link setup

Add `magic-link` to `AUTH_PROVIDERS`:

```
AUTH_PROVIDERS=local,magic-link
MAGIC_LINK_TTL_SECONDS=900             # optional, default 15 min
```

No external credentials needed — magic link uses the existing
`JwtService` for token signing and the existing `EmailService` for
transport. When the email adapter PR lands, the transport will
transparently use whichever `EMAIL_PROVIDER` the operator has
selected (smtp / resend / sendgrid / ses / etc).

### Flow

```
1. User enters email on login page
   └─ frontend POSTs /api/v1/auth/magic-link/request { email }
      └─ backend signs JWT { email, purpose: 'magic-link' }, TTL 15min
      └─ backend emails user a link:
           https://app.example.com/auth/magic-link?token=<jwt>
      └─ returns { success: true } (always, regardless of whether
         the email is registered — enumeration protection)

2. User clicks the link in their email
   └─ frontend extracts token from URL
   └─ frontend POSTs /api/v1/auth/magic-link/verify { token }
      └─ backend verifies JWT (signature + not expired + purpose
         matches)
      └─ backend finds-or-creates user by email
      └─ backend mints a real access token
      └─ returns { success: true, user, access_token }
   └─ frontend stores access_token and redirects to the app
```

### Security properties

- **Enumeration protection**: `requestMagicLink` returns `{ success: true }`
  for every valid-format email, whether or not it's registered. Real
  SMTP failures are logged but not surfaced to the caller.
- **Purpose isolation**: the JWT payload includes `purpose: 'magic-link'`.
  `verifyToken` rejects any token without this purpose, so a stolen
  magic-link token can't be replayed against a different endpoint.
- **Short TTL**: default 15 minutes, configurable via
  `MAGIC_LINK_TTL_SECONDS`.
- **Dev debug token**: in non-production, the request response
  includes `debugToken` so the e2e test and dev user can complete the
  flow without waiting on real email delivery. Production builds
  (`NODE_ENV=production`) never include it.

### Limitations

- **No token revocation**: the JWT is stateless. A leaked token is
  valid until its `exp` claim. For high-security deployments, add a
  `used_tokens` table and check it in `verifyToken`.
- **No rate limiting**: the `/request` endpoint is a potential email
  spam vector. Add a global rate limiter (per-IP or per-email) before
  production use.

## Google / GitHub setup

Both providers use the existing passport strategies in
`backend/src/modules/auth/strategies/`. Wire up credentials in
`.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URL=http://localhost:3001/api/v1/auth/oauth/google/callback

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/github/callback
```

Then add `google` and/or `github` to `AUTH_PROVIDERS` so the registry
exposes them via `/auth/providers`. Without the list entry, the
OAuth routes still work but the frontend won't render the buttons.

## Adding a new provider

1. (OAuth) Implement a new passport strategy in
   `backend/src/modules/auth/strategies/<name>.strategy.ts` — copy
   `github.strategy.ts` and swap the URLs
2. (OIDC / JWT-verify) Write a new service in
   `backend/src/modules/auth/sso/<name>.service.ts`
3. Flip the provider's `implemented: false` → `true` in
   `PROVIDER_CATALOG` in `sso-registry.service.ts`
4. Document env vars here and in `.env.example`
5. Add smoke-test coverage in
   `backend/scripts/smoke-test-auth-sso.ts`

## Admin settings UI (future)

The `SsoRegistryService.getCatalog()` method returns the full list of
providers with their `enabled` + `implemented` flags. A future admin
integrations page can render this to let operators toggle providers
at runtime (writing to a `.env.runtime` overlay).
