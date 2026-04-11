# Code sandbox providers

Team@Once runs user-submitted code for lesson exercises and graded
assessments. Pick a provider by setting `SANDBOX_PROVIDER` in your
`.env`.

```
SANDBOX_PROVIDER=sandpack   # browser-only default (no infra)
```

## Comparison

| Provider | Runs on | Infra | Languages | Anti-cheat | Best for |
|---|---|---|---|---|---|
| **sandpack** *(default)* | user's browser | none | JS/TS/React/Vue/Svelte/Solid | ❌ | lesson previews, UI exercises |
| **judge0** | your server | docker or RapidAPI | 60+ | ✅ | graded assessments |
| **piston** | your server (or emkc.org) | docker or none (public rate-limited) | 40+ | ✅ | lighter alternative to Judge0 |
| **stackblitz** | user's browser | none | Node.js in WebContainers | ❌ | [planned #36] |
| **codesandbox** | codesandbox.io | managed | containers | partial | [planned #36] |
| **none** *(default if unset)* | — | — | — | — | code features disabled |

## Which should I pick?

- **"I just want to show students some React code"** → `sandpack` (zero infra, in-browser)
- **Graded assessments with real scoring** → `judge0` (server-side, 60 languages, full judge feature set)
- **Lightweight polyglot execution without running Judge0** → `piston` (simpler API, public instance for dev)
- **Node.js exercises** → `sandpack` with `template=node`, or wait for `stackblitz` WebContainers (planned)
- **Not using sandboxes yet** → leave `SANDBOX_PROVIDER` unset

## Per-provider setup

### sandpack (default, frontend-only)

```
SANDBOX_PROVIDER=sandpack
SANDPACK_TEMPLATE=react-ts     # optional
```

**Valid templates**: `vanilla`, `vanilla-ts`, `react`, `react-ts`, `vue`, `vue-ts`, `angular`, `svelte`, `solid`, `node`, `nextjs`, `vite-react`, `vite-react-ts`, etc. See <https://sandpack.codesandbox.io/docs> for the full list.

The backend provider is metadata-only — it returns `{ provider: 'sandpack', template }` from `/api/v1/sandbox/config`. The frontend imports `@codesandbox/sandpack-react` and renders `<Sandpack template={template}>` directly. Execution happens entirely in the user's browser via Web Workers + a bundled JS interpreter.

**Calling `POST /sandbox/execute` with sandpack throws** `SandboxProviderNotSupportedError`. This is deliberate: if you need server-side execution, you need a server-side provider. Silent no-op would hide broken assessment wiring.

### judge0

Two deployment modes:

**Self-hosted (recommended, free)**:
```bash
# One-time: docker-compose up from https://github.com/judge0/judge0
docker compose -f judge0-docker-compose.yml up -d
```

```
SANDBOX_PROVIDER=judge0
JUDGE0_URL=http://localhost:2358
```

**RapidAPI-hosted (paid, managed)**:
```
SANDBOX_PROVIDER=judge0
JUDGE0_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=...
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
```

**Supported languages (whitelist in `judge0.provider.ts`)**:

| Language | id |
|---|---|
| javascript / typescript | 63 / 74 |
| python / python3 | 71 |
| java | 62 |
| c / cpp (c++) | 50 / 54 |
| csharp (c#) | 51 |
| go | 60 |
| rust | 73 |
| ruby | 72 |
| php | 68 |
| kotlin / swift | 78 / 83 |
| r / bash | 80 / 46 |
| sql | 82 |

Add more by editing `JUDGE0_LANGUAGES` in the provider file — or a follow-up PR can fetch `/languages` dynamically on startup.

**Execution**: `POST /submissions?base64_encoded=true&wait=true` with base64-encoded source + stdin. The provider decodes the base64-encoded response fields back to plain text.

**Anti-cheat**: Judge0 runs code in a sandboxed environment you control. Time + memory limits are enforced by the sandbox, not the user's browser. Code can't make outbound network calls. This is the right choice for real graded assessments where students might try to cheat.

### piston

```
SANDBOX_PROVIDER=piston
PISTON_URL=https://emkc.org/api/v2/piston    # public, rate-limited
# or self-host:
# PISTON_URL=http://localhost:2000
PISTON_API_KEY=                               # optional, for paid tiers
```

Piston is simpler than Judge0 (single `/execute` endpoint, no submission queue) and lighter-weight to run. Supports ~40 languages.

**Language aliases**: the provider normalizes `js` → `javascript`, `py` → `python`, `cpp` → `c++`, etc. Use whichever alias is most ergonomic.

**Signal handling**: Piston uses `signal: "SIGKILL"` for time-limit kills and `SIGXCPU` for CPU-time-limit kills. The provider maps these to `timeLimitExceeded` / `memoryLimitExceeded` in the unified result.

**Public instance rate limits**: the public Piston at `emkc.org` limits to ~5 requests/second per IP. For production traffic, self-host.

### stackblitz / codesandbox (planned)

Not yet implemented. Selecting either logs a warning and falls back to `none`. Follow-up PRs will:
- `stackblitz`: integrate StackBlitz WebContainers for full Node.js in the browser
- `codesandbox`: use the CodeSandbox Devboxes API for managed containers

### none (default if unset)

Every execute() call throws `SandboxProviderNotConfiguredError`. The startup log tells the operator which env var to set.

## Endpoints

```
GET  /api/v1/sandbox/config         — frontend bootstrap (public)
GET  /api/v1/sandbox/languages      — list supported languages (public)
POST /api/v1/sandbox/execute        — run code (JWT required)
     Body: { language, source, stdin?, timeLimitSeconds?, memoryLimitKb?, commandLineArgs? }
     Returns: { stdout, stderr, exitCode, timeLimitExceeded, memoryLimitExceeded, durationMs, provider }
```

The `/execute` endpoint is JWT-protected because real code execution costs compute — unauthenticated abuse would be expensive. For public lesson previews using `sandpack`, the frontend renders `<Sandpack>` directly and never calls this endpoint.

Input validation:
- `source` max 64KB (hard limit in the controller)
- `timeLimitSeconds` defaults to 5, enforced by the provider
- `memoryLimitKb` defaults to 128MB, enforced by the provider

## Adding a new provider

1. Implement `SandboxProvider` in
   `backend/src/modules/sandbox/providers/<name>.provider.ts`
2. Add a case to `createSandboxProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. Add smoke-test coverage in
   `backend/scripts/smoke-test-sandbox-providers.ts` — mock `fetch`
   and verify URL, headers, payload translation, response parsing
