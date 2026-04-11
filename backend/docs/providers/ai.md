# AI / LLM providers

Vasty Shop supports five AI backends plus a `none` default. Pick one by
setting `AI_PROVIDER` in your `.env`.

```
AI_PROVIDER=openai   # highest-quality default
```

## Comparison

| Provider | Cost | Vision | Embeddings | JSON mode | Best for |
|---|---|---|---|---|---|
| **openai** | paid (3k-tier free trial) | ✅ | ✅ | native | highest quality, default |
| **anthropic** | paid | ✅ | ❌ | prompt-based | long-context reasoning, product copy |
| **gemini** | generous free tier | ✅ | ✅ | native | cheap vision, multimodal |
| **ollama** | free (local) | ✅ *(LLaVA)* | ✅ *(nomic-embed-text)* | `format=json` | fully offline dev, zero API cost |
| **groq** | generous free tier | ⚠️ *(model-dependent)* | ❌ | via prompt | ultra-low latency |
| **none** | — | — | — | — | default — AI features disabled |

## Which should I pick?

- **"I'm a new contributor cloning the repo"** → `ollama` (zero API keys needed, fully offline)
- **Production default, highest quality** → `openai`
- **Long product descriptions / reasoning-heavy flows** → `anthropic`
- **Cheap vision (product photo autofill) at scale** → `gemini`
- **Real-time UX where latency matters** → `groq`
- **Haven't decided yet** → leave `AI_PROVIDER` unset; AI features fail loudly instead of silently returning empty

## Per-provider setup

### openai (recommended for production)

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini              # text model
AI_VISION_MODEL=gpt-4o            # vision model
AI_EMBEDDING_MODEL=text-embedding-3-small
```

**OpenAI-compatible gateways** (Azure OpenAI, LiteLLM, LocalAI, etc.) are supported via the optional `OPENAI_BASE_URL` override:

```
OPENAI_BASE_URL=https://your-azure-gateway.openai.azure.com/v1
```

### anthropic

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5        # or claude-opus-4-5, claude-haiku-4-5
```

**JSON mode**: Anthropic has no native JSON mode, so the provider prepends a system instruction asking for "ONLY a valid JSON object, no prose, no markdown code fences" when `jsonMode: true`. Works well in practice but isn't as reliable as native-JSON providers.

**Embeddings**: Not supported. Anthropic has no embeddings endpoint. The provider throws `AiProviderNotSupportedError` with a pointer to Voyage AI, OpenAI, or a local embedding model.

**Vision**: Pass a `data:image/...;base64,...` URI or a public URL. The provider translates to Anthropic's `{ type: 'image', source: { type: 'base64'|'url', ... } }` block format.

### gemini

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...
AI_MODEL=gemini-2.0-flash-exp
AI_VISION_MODEL=gemini-2.0-flash-exp
AI_EMBEDDING_MODEL=text-embedding-004
```

The provider translates our `{ role: 'system' }` messages to Gemini's top-level `system_instruction` field, and `{ role: 'assistant' }` to `{ role: 'model' }`.

**JSON mode**: native via `response_mime_type: 'application/json'`.

### ollama (recommended for dev)

```
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434    # default
AI_MODEL=llama3.2                         # text model
AI_VISION_MODEL=llava                     # vision model
AI_EMBEDDING_MODEL=nomic-embed-text
```

Install and pull models once:

```bash
# One-time setup
ollama pull llama3.2
ollama pull llava               # for vision
ollama pull nomic-embed-text    # for embeddings
```

Or run via Docker once the install wizard PR (#27) lands:

```bash
docker compose --profile ollama up -d
```

**JSON mode**: native via `format: 'json'`.

**Vision**: accepts `data:` URIs and public URLs. For URLs, the provider fetches the image and base64-encodes it before sending (Ollama doesn't accept remote URLs directly).

**Reachability**: if Ollama isn't running, the provider throws `AiProviderNotConfiguredError` on first call with a clear message: `"OLLAMA_BASE_URL (http://localhost:11434 unreachable — start with 'ollama serve' or 'docker compose --profile ollama up -d')"`.

### groq

```
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
AI_MODEL=llama-3.3-70b-versatile
```

Groq's API is OpenAI-compatible — the provider composes an `OpenAiProvider` internally at `https://api.groq.com/openai/v1` with your Groq credentials. Same payload shape, same response shape, ~10x faster inference.

**Vision**: model-dependent. `llama-3.2-90b-vision-preview` supports images; other Groq models don't. Pick a vision-capable model in `AI_VISION_MODEL`.

**Embeddings**: not supported. Groq has no embeddings endpoint. The provider throws `AiProviderNotSupportedError`.

### none (default if unset)

Every method throws `AiProviderNotConfiguredError`. The startup log prints which env var to set.

## Migration from the existing `AiService`

`backend/src/modules/ai/ai.service.ts` currently:
1. Calls `this.db.getAI().analyzeImage()` — a "database SDK" method that doesn't exist in practice
2. Falls back to a direct `fetch` to `https://api.openai.com/v1/chat/completions`

The new `AiProvider` interface covers the same shape (`generateText`, `analyzeImage`, `generateEmbedding`). A follow-up PR will migrate `AiService` to inject `createAiProvider(config)` and delete the dead database-SDK path. This PR just lands the adapter; the migration is intentionally out of scope to keep the diff reviewable.

## Adding a new provider

1. Implement `AiProvider` in
   `backend/src/modules/ai/providers/<name>.provider.ts`
2. Add a case to `createAiProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. Add smoke-test coverage in
   `backend/scripts/smoke-test-ai-providers.ts` — mock `fetch`, assert
   URL / auth / payload translation per method.
