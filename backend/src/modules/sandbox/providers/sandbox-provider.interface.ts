/**
 * Common interface that every code sandbox / execution provider
 * implements.
 *
 * Pick a provider by setting SANDBOX_PROVIDER in your .env to one of:
 *
 *   sandpack    - CodeSandbox Sandpack. In-browser Web Worker runtime.
 *                 No server-side execution. The provider just returns
 *                 frontend config so the <Sandpack> React component
 *                 can bootstrap. Zero infra, zero cost. Perfect for
 *                 JS/TS/React lesson exercises where grading is
 *                 presentation-only (show output, no anti-cheat).
 *                 The default.
 *
 *   judge0      - Judge0 (https://judge0.com). Real server-side
 *                 polyglot code execution across 60+ languages. Can
 *                 be self-hosted (docker) or consumed via RapidAPI.
 *                 Enables anti-cheat grading because source + stdin
 *                 run on your infra, not the user's browser.
 *
 *   piston      - Piston (https://github.com/engineer-man/piston).
 *                 Open-source polyglot runner from engineer-man.
 *                 Public instance at emkc.org/api/v2/piston
 *                 (rate-limited) or self-host. Lighter-weight than
 *                 Judge0, fewer languages.
 *
 *   stackblitz  - StackBlitz WebContainers. Full Node.js in the
 *                 browser. [PLANNED follow-up]
 *
 *   codesandbox - CodeSandbox Devboxes API. Managed containers.
 *                 [PLANNED follow-up]
 *
 *   none        - Code execution disabled. Every method throws.
 *                 The default if SANDBOX_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/sandbox.md.
 */

export interface ExecuteInput {
  /** Language id: "javascript", "python", "cpp", "rust", etc. */
  language: string;
  /** Source code to run. */
  source: string;
  /** stdin fed to the program. */
  stdin?: string;
  /** Max runtime in seconds. Default 5. */
  timeLimitSeconds?: number;
  /** Max memory in KB. Default 128000 (128 MB). */
  memoryLimitKb?: number;
  /** Command-line arguments. */
  commandLineArgs?: string[];
}

export interface ExecuteResult {
  /** Combined stdout from the program. */
  stdout: string;
  /** Combined stderr. */
  stderr: string;
  /** Compilation output (empty for interpreted languages). */
  compileOutput?: string;
  /** Process exit code. null if killed by timeout / memory. */
  exitCode: number | null;
  /** True if the program exceeded the time limit. */
  timeLimitExceeded: boolean;
  /** True if the program exceeded the memory limit. */
  memoryLimitExceeded: boolean;
  /** Wall-clock runtime in milliseconds. */
  durationMs?: number;
  /** Peak memory in KB. */
  memoryKb?: number;
  /** Provider name. */
  provider: string;
}

export interface LanguageInfo {
  /** Canonical id used in ExecuteInput.language. */
  id: string;
  /** Human-readable name ("JavaScript (Node.js 20)"). */
  name: string;
  /** Language version string ("20.10.0") if the provider reports it. */
  version?: string;
}

export interface FrontendSandboxConfig {
  /** Provider name for the <Sandbox> React component to pick the right UI. */
  provider: string;
  /** For sandpack: default template ("react-ts", "vanilla", "node"). */
  template?: string;
  /** For stackblitz: project type. */
  stackblitzProject?: string;
  /** Any extra config the frontend needs. */
  extra?: Record<string, any>;
}

/**
 * Common interface implemented by every sandbox provider. Methods a
 * provider can't support should throw SandboxProviderNotSupportedError
 * — never silently no-op.
 */
export interface SandboxProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'sandpack'
    | 'judge0'
    | 'piston'
    | 'stackblitz'
    | 'codesandbox'
    | 'none';

  /** True if the provider has the credentials/infra it needs. */
  isAvailable(): boolean;

  /**
   * Execute a code submission server-side. For in-browser providers
   * (sandpack, stackblitz) this throws SandboxProviderNotSupportedError
   * — execution happens in the user's browser, graded presentationally.
   */
  execute(input: ExecuteInput): Promise<ExecuteResult>;

  /** List languages this provider can execute. */
  listLanguages(): Promise<LanguageInfo[]>;

  /** Frontend-safe bootstrap config for the <Sandbox> component. */
  getFrontendConfig(): FrontendSandboxConfig;
}

/**
 * Thrown when a provider is asked to do something it can't support
 * (e.g. execute() on sandpack).
 */
export class SandboxProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" sandbox provider. See docs/providers/sandbox.md.`,
    );
    this.name = 'SandboxProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class SandboxProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Sandbox provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/sandbox.md.`,
    );
    this.name = 'SandboxProviderNotConfiguredError';
  }
}
