/**
 * Smoke test for the multi-provider AI factory.
 *
 * Mocks `fetch` so no real API calls are made to any LLM vendor.
 * Verifies factory instantiation, URL / auth / payload shape per
 * provider, translation from the unified GenerateTextInput shape to
 * each vendor's native format, and NotConfigured / NotSupported
 * error behaviour.
 *
 * Run with: npx ts-node scripts/smoke-test-ai-providers.ts
 */
import { ConfigService } from '@nestjs/config';
import {
  createAiProvider,
  AiProviderNotConfiguredError,
  AiProviderNotSupportedError,
} from '../src/modules/ai/providers';

function fakeConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (env[key] as any) ?? def,
  } as unknown as ConfigService;
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};
const fetchCalls: FetchCall[] = [];
const realFetch = global.fetch;
function installMockFetch(status = 200, body: any = {}) {
  global.fetch = (async (url: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k] = String(v);
      }
    }
    fetchCalls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : null,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
}
function restoreFetch() {
  global.fetch = realFetch;
}

async function expectThrow(
  label: string,
  fn: () => Promise<unknown>,
  matcher: (e: Error) => boolean,
): Promise<boolean> {
  try {
    await fn();
    console.log(`  ❌ ${label}: expected throw, got success`);
    return false;
  } catch (e) {
    if (matcher(e as Error)) {
      console.log(`  ✅ ${label}: threw as expected`);
      return true;
    }
    console.log(`  ❌ ${label}: wrong error: ${(e as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  const ok = (b: boolean) => (b ? pass++ : fail++);
  console.log('=== AI provider factory smoke test ===\n');

  // 1. none default
  console.log('1. no AI_PROVIDER → none');
  {
    const p = createAiProvider(fakeConfig({}));
    ok(p.name === 'none');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'generateText fails loudly',
        () =>
          p.generateText({
            messages: [{ role: 'user', content: 'hi' }],
          }),
        (e) => e instanceof AiProviderNotConfiguredError,
      ),
    );
  }

  // 2. openai without key → unavailable
  console.log('\n2. openai without key → unavailable');
  {
    const p = createAiProvider(fakeConfig({ AI_PROVIDER: 'openai' }));
    ok(p.name === 'openai');
    ok(p.isAvailable() === false);
    ok(
      await expectThrow(
        'generateText throws NotConfigured',
        () => p.generateText({ messages: [{ role: 'user', content: 'hi' }] }),
        (e) => e instanceof AiProviderNotConfiguredError,
      ),
    );
  }

  // 3. openai happy path
  console.log('\n3. openai generateText (mocked)');
  {
    installMockFetch(200, {
      choices: [{ message: { content: 'Hello there!' } }],
      model: 'gpt-4o-mini',
      usage: {
        prompt_tokens: 5,
        completion_tokens: 3,
        total_tokens: 8,
      },
    });
    try {
      const p = createAiProvider(
        fakeConfig({
          AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'sk-test-123',
        }),
      );
      ok(p.isAvailable() === true);
      const result = await p.generateText({
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Say hi' },
        ],
        jsonMode: false,
      });
      ok(result.text === 'Hello there!');
      ok(result.provider === 'openai');
      ok(result.usage?.totalTokens === 8);
      console.log(`  ✅ text: "${result.text}" (${result.usage?.totalTokens} tokens)`);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.openai.com/v1/chat/completions');
      ok(call.headers['Authorization'] === 'Bearer sk-test-123');
      const payload = JSON.parse(call.body!);
      ok(payload.model === 'gpt-4o-mini');
      ok(payload.messages.length === 2);
      ok(payload.messages[0].role === 'system');
      console.log(`  ✅ correct URL, auth, messages passed through`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 4. openai jsonMode sets response_format
  console.log('\n4. openai jsonMode sets response_format');
  {
    installMockFetch(200, {
      choices: [{ message: { content: '{"ok":true}' } }],
      model: 'gpt-4o-mini',
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }),
      );
      await p.generateText({
        messages: [{ role: 'user', content: 'return json' }],
        jsonMode: true,
      });
      const payload = JSON.parse(fetchCalls[fetchCalls.length - 1].body!);
      ok(payload.response_format?.type === 'json_object');
      console.log(`  ✅ jsonMode → response_format.type=json_object`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 5. openai analyzeImage
  console.log('\n5. openai analyzeImage — multipart content with image_url');
  {
    installMockFetch(200, {
      choices: [{ message: { content: 'I see a red shirt.' } }],
      model: 'gpt-4o',
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }),
      );
      const result = await p.analyzeImage({
        image: 'https://example.com/shirt.jpg',
        prompt: 'What is in this image?',
      });
      ok(result.text === 'I see a red shirt.');
      ok(result.provider === 'openai');
      const payload = JSON.parse(fetchCalls[fetchCalls.length - 1].body!);
      ok(Array.isArray(payload.messages[0].content));
      ok(payload.messages[0].content.some((c: any) => c.type === 'image_url'));
      ok(payload.messages[0].content.some((c: any) => c.type === 'text'));
      console.log(`  ✅ image_url + text parts in message content`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 6. openai generateEmbedding
  console.log('\n6. openai generateEmbedding (batch)');
  {
    installMockFetch(200, {
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
      model: 'text-embedding-3-small',
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }),
      );
      const result = await p.generateEmbedding({ text: ['a', 'b'] });
      ok(result.embeddings.length === 2);
      ok(result.dimensions === 3);
      console.log(`  ✅ returned ${result.embeddings.length} vectors, dim=${result.dimensions}`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 7. anthropic happy path — splits system message correctly
  console.log('\n7. anthropic generateText — system split + content blocks');
  {
    installMockFetch(200, {
      content: [{ type: 'text', text: 'Hello from Claude' }],
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    try {
      const p = createAiProvider(
        fakeConfig({
          AI_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'sk-ant-test',
        }),
      );
      const result = await p.generateText({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      });
      ok(result.text === 'Hello from Claude');
      ok(result.provider === 'anthropic');

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.anthropic.com/v1/messages');
      ok(call.headers['x-api-key'] === 'sk-ant-test');
      ok(call.headers['anthropic-version'] === '2023-06-01');
      const payload = JSON.parse(call.body!);
      ok(payload.system === 'You are helpful.');
      ok(payload.messages.length === 1); // system stripped out
      ok(payload.messages[0].role === 'user');
      console.log(`  ✅ system split, x-api-key header, messages stripped of system`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 8. anthropic generateEmbedding → NotSupported
  console.log('\n8. anthropic generateEmbedding → NotSupported');
  {
    const p = createAiProvider(
      fakeConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
    );
    ok(
      await expectThrow(
        'anthropic embeddings throws NotSupported',
        () => p.generateEmbedding({ text: 'hi' }),
        (e) => e instanceof AiProviderNotSupportedError,
      ),
    );
  }

  // 9. gemini translation
  console.log('\n9. gemini generateText — role translation + system_instruction');
  {
    installMockFetch(200, {
      candidates: [
        {
          content: { parts: [{ text: 'Hi from Gemini' }] },
        },
      ],
      usageMetadata: {
        promptTokenCount: 8,
        candidatesTokenCount: 4,
        totalTokenCount: 12,
      },
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'gem-key' }),
      );
      const result = await p.generateText({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'Again?' },
        ],
      });
      ok(result.text === 'Hi from Gemini');
      ok(result.provider === 'gemini');

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url.startsWith('https://generativelanguage.googleapis.com'));
      ok(call.url.includes('key=gem-key'));
      const payload = JSON.parse(call.body!);
      ok(payload.system_instruction?.parts?.[0]?.text === 'Be brief.');
      ok(payload.contents.length === 3); // system removed
      ok(payload.contents[0].role === 'user');
      ok(payload.contents[1].role === 'model'); // assistant → model
      ok(payload.contents[2].role === 'user');
      console.log(`  ✅ system_instruction + role translation (assistant→model)`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 10. gemini jsonMode → response_mime_type
  console.log('\n10. gemini jsonMode → response_mime_type=application/json');
  {
    installMockFetch(200, {
      candidates: [{ content: { parts: [{ text: '{}' }] } }],
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }),
      );
      await p.generateText({
        messages: [{ role: 'user', content: 'json please' }],
        jsonMode: true,
      });
      const payload = JSON.parse(fetchCalls[fetchCalls.length - 1].body!);
      ok(payload.generationConfig.response_mime_type === 'application/json');
      console.log(`  ✅ jsonMode → response_mime_type correct`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 11. ollama is always available, uses local URL
  console.log('\n11. ollama generateText');
  {
    installMockFetch(200, {
      message: { content: 'Local response' },
      model: 'llama3.2',
      prompt_eval_count: 3,
      eval_count: 5,
    });
    try {
      const p = createAiProvider(fakeConfig({ AI_PROVIDER: 'ollama' }));
      ok(p.name === 'ollama');
      ok(p.isAvailable() === true);
      const result = await p.generateText({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      ok(result.text === 'Local response');
      ok(result.provider === 'ollama');
      ok(result.usage?.totalTokens === 8);

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'http://localhost:11434/api/chat');
      const payload = JSON.parse(call.body!);
      ok(payload.stream === false);
      ok(payload.options.num_predict === 2000);
      console.log(`  ✅ local URL + stream=false + num_predict option`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 12. ollama jsonMode → format=json
  console.log('\n12. ollama jsonMode → format=json');
  {
    installMockFetch(200, { message: { content: '{}' }, model: 'llama3.2' });
    try {
      const p = createAiProvider(fakeConfig({ AI_PROVIDER: 'ollama' }));
      await p.generateText({
        messages: [{ role: 'user', content: 'json' }],
        jsonMode: true,
      });
      const payload = JSON.parse(fetchCalls[fetchCalls.length - 1].body!);
      ok(payload.format === 'json');
      console.log(`  ✅ jsonMode → format=json`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 13. groq — composes OpenAI, routes to Groq base URL
  console.log('\n13. groq uses OpenAI shape at api.groq.com');
  {
    installMockFetch(200, {
      choices: [{ message: { content: 'Fast response' } }],
      model: 'llama-3.3-70b-versatile',
    });
    try {
      const p = createAiProvider(
        fakeConfig({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test' }),
      );
      ok(p.name === 'groq');
      ok(p.isAvailable() === true);
      const result = await p.generateText({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      ok(result.provider === 'groq');
      ok(result.text === 'Fast response');

      const call = fetchCalls[fetchCalls.length - 1];
      ok(call.url === 'https://api.groq.com/openai/v1/chat/completions');
      ok(call.headers['Authorization'] === 'Bearer gsk_test');
      console.log(`  ✅ groq routed to api.groq.com with gsk_ token`);
    } finally {
      restoreFetch();
      fetchCalls.length = 0;
    }
  }

  // 14. groq generateEmbedding → NotSupported
  console.log('\n14. groq generateEmbedding → NotSupported');
  {
    const p = createAiProvider(
      fakeConfig({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'k' }),
    );
    ok(
      await expectThrow(
        'groq embeddings throws NotSupported',
        () => p.generateEmbedding({ text: 'hi' }),
        (e) => e instanceof AiProviderNotSupportedError,
      ),
    );
  }

  // 15. unknown value
  console.log('\n15. AI_PROVIDER=foobar → none (fallback)');
  {
    const p = createAiProvider(fakeConfig({ AI_PROVIDER: 'foobar' }));
    ok(p.name === 'none');
    console.log(`  ✅ fallback to none`);
  }

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
