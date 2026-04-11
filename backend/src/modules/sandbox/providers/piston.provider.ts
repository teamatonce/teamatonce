/**
 * Piston sandbox provider.
 *
 *   SANDBOX_PROVIDER=piston
 *   PISTON_URL=https://emkc.org/api/v2/piston   # public instance (default)
 *   PISTON_API_KEY=                             # optional, for paid tiers
 *
 * Piston (https://github.com/engineer-man/piston) is an open-source
 * polyglot code runner from engineer-man. Free public instance at
 * emkc.org/api/v2/piston (rate-limited) or self-host for unlimited.
 *
 * Simpler API than Judge0 (single POST /execute endpoint, no
 * submission polling). Supports 40+ languages. Lighter-weight if
 * you don't need Judge0's full judge feature set.
 *
 * Use for: lesson exercises and medium-grade assessments where you
 * need real server-side execution but don't need the full Judge0
 * submission-queue + grading UX.
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

/**
 * Piston language aliases. Piston uses language names like
 * "javascript" / "python3" / "c++" directly, so the map is lighter
 * than Judge0's numeric id lookup. Still useful for normalization
 * (e.g. accepting "python" as "python3").
 */
const PISTON_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  python3: 'python',
  cpp: 'c++',
  'c++': 'c++',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  kt: 'kotlin',
  sh: 'bash',
};

/** Known languages exposed via listLanguages(). Not authoritative —
 * a follow-up can fetch /runtimes for the live list. */
const PISTON_KNOWN_LANGUAGES: LanguageInfo[] = [
  { id: 'javascript', name: 'JavaScript (Node.js)' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'python', name: 'Python 3' },
  { id: 'java', name: 'Java' },
  { id: 'c', name: 'C' },
  { id: 'c++', name: 'C++' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
  { id: 'ruby', name: 'Ruby' },
  { id: 'php', name: 'PHP' },
  { id: 'bash', name: 'Bash' },
  { id: 'kotlin', name: 'Kotlin' },
  { id: 'swift', name: 'Swift' },
  { id: 'haskell', name: 'Haskell' },
  { id: 'elixir', name: 'Elixir' },
];

export class PistonProvider implements SandboxProvider {
  readonly name = 'piston' as const;
  private readonly logger = new Logger('PistonProvider');

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('PISTON_URL', 'https://emkc.org/api/v2/piston') ||
      'https://emkc.org/api/v2/piston'
    ).replace(/\/+$/, '');
    this.apiKey = config.get<string>('PISTON_API_KEY', '');

    this.logger.log(
      `Piston provider configured (${this.baseUrl}${this.apiKey ? ', authenticated' : ''})`,
    );
  }

  isAvailable(): boolean {
    // Always available — the public instance needs no auth.
    return true;
  }

  private async pistonApi(path: string, body: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `Piston API ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  private normalizeLanguage(language: string): string {
    const key = language.toLowerCase().trim();
    return PISTON_LANGUAGE_ALIASES[key] ?? key;
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const language = this.normalizeLanguage(input.language);
    const started = Date.now();

    // Piston's /execute shape:
    //   { language, version: "*", files: [{ content }], stdin, args,
    //     compile_timeout: ms, run_timeout: ms, compile_memory_limit,
    //     run_memory_limit }
    const res = (await this.pistonApi('/execute', {
      language,
      version: '*',
      files: [{ content: input.source }],
      stdin: input.stdin ?? '',
      args: input.commandLineArgs ?? [],
      run_timeout: (input.timeLimitSeconds ?? 5) * 1000,
      run_memory_limit: input.memoryLimitKb ?? 128_000,
      compile_timeout: 10_000,
      compile_memory_limit: 128_000,
    })) as {
      language: string;
      version: string;
      run: {
        stdout: string;
        stderr: string;
        code: number | null;
        signal: string | null;
        output: string;
      };
      compile?: {
        stdout: string;
        stderr: string;
        code: number | null;
        output: string;
      };
    };

    // Piston uses `signal: "SIGKILL"` for timeout/memory kills.
    const killedBySignal =
      res.run.signal === 'SIGKILL' || res.run.signal === 'SIGXCPU';

    return {
      stdout: res.run.stdout,
      stderr: res.run.stderr,
      compileOutput: res.compile?.output,
      exitCode: res.run.code,
      timeLimitExceeded: killedBySignal && res.run.signal === 'SIGKILL',
      memoryLimitExceeded: killedBySignal && res.run.signal === 'SIGXCPU',
      durationMs: Date.now() - started,
      provider: 'piston',
    };
  }

  async listLanguages(): Promise<LanguageInfo[]> {
    return PISTON_KNOWN_LANGUAGES;
  }

  getFrontendConfig(): FrontendSandboxConfig {
    return {
      provider: 'piston',
      extra: {
        executeEndpoint: '/api/v1/sandbox/execute',
      },
    };
  }
}
