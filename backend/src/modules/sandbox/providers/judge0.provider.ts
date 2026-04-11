/**
 * Judge0 sandbox provider (server-side code execution).
 *
 *   SANDBOX_PROVIDER=judge0
 *   JUDGE0_URL=https://judge0-ce.p.rapidapi.com
 *   JUDGE0_API_KEY=...                    # only for RapidAPI-hosted
 *   JUDGE0_API_HOST=judge0-ce.p.rapidapi.com  # only for RapidAPI-hosted
 *
 * Judge0 (https://judge0.com) is a polyglot online judge supporting
 * 60+ languages. Two ways to use it:
 *
 *   1. Self-hosted (free, docker-compose):
 *        JUDGE0_URL=http://localhost:2358
 *        (no API key or host header needed)
 *
 *   2. RapidAPI-hosted (paid, managed):
 *        JUDGE0_URL=https://judge0-ce.p.rapidapi.com
 *        JUDGE0_API_KEY=<your rapidapi key>
 *        JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
 *
 * The provider POSTs code + stdin to /submissions?base64_encoded=true&wait=true
 * and receives the execution result synchronously. For longer-running
 * jobs, use base64_encoded=true without wait=true and poll — that's
 * a follow-up.
 *
 * This is the recommended provider for GRADED assessments because:
 *  1. Code runs on YOUR infrastructure, not the student's browser
 *  2. stdin is fed in securely (can't be tampered with)
 *  3. Time/memory limits are enforced by the sandbox
 *  4. 60+ languages cover practically any curriculum
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExecuteInput,
  ExecuteResult,
  FrontendSandboxConfig,
  LanguageInfo,
  SandboxProvider,
  SandboxProviderNotConfiguredError,
} from './sandbox-provider.interface';

/** Judge0 language id map. Only the top 20-ish — the provider
 * validates against this set so typos fail fast instead of reaching
 * the API. A follow-up can load this dynamically from /languages. */
const JUDGE0_LANGUAGES: Record<string, { id: number; name: string }> = {
  javascript: { id: 63, name: 'JavaScript (Node.js 12.14.0)' },
  typescript: { id: 74, name: 'TypeScript (3.7.4)' },
  python: { id: 71, name: 'Python (3.8.1)' },
  'python3': { id: 71, name: 'Python (3.8.1)' },
  java: { id: 62, name: 'Java (OpenJDK 13.0.1)' },
  c: { id: 50, name: 'C (GCC 9.2.0)' },
  cpp: { id: 54, name: 'C++ (GCC 9.2.0)' },
  'c++': { id: 54, name: 'C++ (GCC 9.2.0)' },
  csharp: { id: 51, name: 'C# (Mono 6.6.0.161)' },
  'c#': { id: 51, name: 'C# (Mono 6.6.0.161)' },
  go: { id: 60, name: 'Go (1.13.5)' },
  rust: { id: 73, name: 'Rust (1.40.0)' },
  ruby: { id: 72, name: 'Ruby (2.7.0)' },
  php: { id: 68, name: 'PHP (7.4.1)' },
  kotlin: { id: 78, name: 'Kotlin (1.3.70)' },
  swift: { id: 83, name: 'Swift (5.2.3)' },
  r: { id: 80, name: 'R (4.0.0)' },
  bash: { id: 46, name: 'Bash (5.0.0)' },
  sql: { id: 82, name: 'SQL (SQLite 3.27.2)' },
};

export class Judge0Provider implements SandboxProvider {
  readonly name = 'judge0' as const;
  private readonly logger = new Logger('Judge0Provider');

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiHost: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('JUDGE0_URL', '') || '').replace(/\/+$/, '');
    this.apiKey = config.get<string>('JUDGE0_API_KEY', '');
    this.apiHost = config.get<string>('JUDGE0_API_HOST', '');

    if (this.isAvailable()) {
      this.logger.log(
        `Judge0 provider configured (${this.baseUrl}${this.apiKey ? ', RapidAPI' : ', self-hosted'})`,
      );
    } else {
      this.logger.warn(
        'Judge0 provider selected but JUDGE0_URL missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.baseUrl;
  }

  private async judge0Api(
    method: 'GET' | 'POST',
    path: string,
    body?: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new SandboxProviderNotConfiguredError('judge0', ['JUDGE0_URL']);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers['X-RapidAPI-Key'] = this.apiKey;
    if (this.apiHost) headers['X-RapidAPI-Host'] = this.apiHost;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `Judge0 API ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  /**
   * Base64-encode a string for Judge0's base64_encoded=true mode.
   * Keeps binary-safe transmission of Unicode source / stdin.
   */
  private b64(s: string): string {
    return Buffer.from(s, 'utf-8').toString('base64');
  }

  private b64Decode(s: string | null | undefined): string {
    if (!s) return '';
    try {
      return Buffer.from(s, 'base64').toString('utf-8');
    } catch {
      return s;
    }
  }

  private resolveLanguageId(language: string): number {
    const key = language.toLowerCase().trim();
    const entry = JUDGE0_LANGUAGES[key];
    if (!entry) {
      throw new Error(
        `Judge0 provider does not know language "${language}". Known: ${Object.keys(JUDGE0_LANGUAGES).join(', ')}. Add to JUDGE0_LANGUAGES or fetch /languages dynamically.`,
      );
    }
    return entry.id;
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const languageId = this.resolveLanguageId(input.language);
    const started = Date.now();

    const res = (await this.judge0Api(
      'POST',
      '/submissions?base64_encoded=true&wait=true',
      {
        language_id: languageId,
        source_code: this.b64(input.source),
        stdin: input.stdin ? this.b64(input.stdin) : '',
        cpu_time_limit: input.timeLimitSeconds ?? 5,
        memory_limit: input.memoryLimitKb ?? 128_000,
        command_line_arguments: input.commandLineArgs?.join(' '),
      },
    )) as {
      stdout?: string;
      stderr?: string;
      compile_output?: string;
      exit_code?: number | null;
      time?: string;
      memory?: number;
      status?: { id: number; description: string };
    };

    // Judge0 status ids:
    //   1: queued, 2: processing, 3: accepted, 4: wrong answer
    //   5: time limit exceeded, 6: compilation error, 7-12: runtime errors
    //   13: internal error, 14: exec format error
    const statusId = res.status?.id ?? 0;

    return {
      stdout: this.b64Decode(res.stdout),
      stderr: this.b64Decode(res.stderr),
      compileOutput: this.b64Decode(res.compile_output),
      exitCode: res.exit_code ?? null,
      timeLimitExceeded: statusId === 5,
      memoryLimitExceeded: false, // Judge0 lumps this into status=5
      durationMs: res.time
        ? Math.round(parseFloat(res.time) * 1000)
        : Date.now() - started,
      memoryKb: res.memory,
      provider: 'judge0',
    };
  }

  async listLanguages(): Promise<LanguageInfo[]> {
    return Object.entries(JUDGE0_LANGUAGES).map(([id, meta]) => ({
      id,
      name: meta.name,
    }));
  }

  getFrontendConfig(): FrontendSandboxConfig {
    return {
      provider: 'judge0',
      extra: {
        // Frontend should POST to our internal /sandbox/execute
        // endpoint (which calls this provider) rather than hitting
        // Judge0 directly.
        executeEndpoint: '/api/v1/sandbox/execute',
      },
    };
  }
}
