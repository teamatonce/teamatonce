/**
 * Sandpack sandbox provider (frontend-only execution).
 *
 *   SANDBOX_PROVIDER=sandpack    (default)
 *
 * CodeSandbox Sandpack is an in-browser code runtime built on Web
 * Workers + a bundled JS interpreter. The "provider" here is
 * metadata-only — actual execution happens client-side in the
 * user's browser, so there's no backend API call.
 *
 * Optional env vars:
 *   SANDPACK_TEMPLATE=react-ts    (default)
 *      Valid values: vanilla, vanilla-ts, react, react-ts, vue,
 *      vue-ts, angular, svelte, solid, node, nextjs, vite-react,
 *      vite-react-ts, etc. See https://sandpack.codesandbox.io/docs
 *
 * Use this for JS/TS/React lesson exercises where grading is
 * presentation-only (show the output in an iframe, no anti-cheat
 * grading). For graded assessments with real scoring, use judge0
 * or piston instead — those execute server-side where the student
 * can't tamper with the runtime.
 *
 * The frontend loads the @codesandbox/sandpack-react package and
 * renders a <Sandpack template={...}> component. The provider's
 * only job is to tell it which template to use.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExecuteInput,
  ExecuteResult,
  FrontendSandboxConfig,
  LanguageInfo,
  SandboxProvider,
  SandboxProviderNotSupportedError,
} from './sandbox-provider.interface';

export class SandpackProvider implements SandboxProvider {
  readonly name = 'sandpack' as const;
  private readonly logger = new Logger('SandpackProvider');

  private readonly template: string;

  constructor(config: ConfigService) {
    this.template = config.get<string>('SANDPACK_TEMPLATE', 'react-ts');
    this.logger.log(
      `Sandpack provider configured (template=${this.template}) — execution is client-side only`,
    );
  }

  isAvailable(): boolean {
    // Always available — no backend config needed, everything is
    // rendered + executed in the browser.
    return true;
  }

  async execute(_input: ExecuteInput): Promise<ExecuteResult> {
    // Sandpack runs in the user's browser — the backend has no
    // access to the runtime. Throwing here instead of silently
    // no-op'ing forces the caller to realize they need a
    // server-side provider (judge0/piston) for graded assessments.
    throw new SandboxProviderNotSupportedError(
      'sandpack',
      'execute (Sandpack runs in the browser — use judge0 or piston for server-side execution, or grade presentationally via the Sandpack iframe output)',
    );
  }

  async listLanguages(): Promise<LanguageInfo[]> {
    // Sandpack's supported languages are really "templates" — what
    // JS bundler config to ship to the browser. Expose the common
    // set so callers can surface them in a picker UI.
    return [
      { id: 'vanilla', name: 'Vanilla JavaScript' },
      { id: 'vanilla-ts', name: 'Vanilla TypeScript' },
      { id: 'react', name: 'React' },
      { id: 'react-ts', name: 'React + TypeScript' },
      { id: 'vue', name: 'Vue' },
      { id: 'vue-ts', name: 'Vue + TypeScript' },
      { id: 'angular', name: 'Angular' },
      { id: 'svelte', name: 'Svelte' },
      { id: 'solid', name: 'Solid' },
      { id: 'node', name: 'Node.js' },
      { id: 'nextjs', name: 'Next.js' },
      { id: 'vite-react', name: 'Vite + React' },
      { id: 'vite-react-ts', name: 'Vite + React + TypeScript' },
    ];
  }

  getFrontendConfig(): FrontendSandboxConfig {
    return {
      provider: 'sandpack',
      template: this.template,
    };
  }
}
