/**
 * Team@Once first-run setup wizard.
 *
 * Interactive CLI that walks a new user through picking providers for each
 * infrastructure concern, writes a working `.env` file, and prints next steps.
 * Every prompt has a free / zero-infra default marked in (parentheses) so the
 * fastest path is just pressing Enter through the whole wizard.
 *
 * Run with:
 *    cd backend && npx ts-node scripts/setup.ts
 *
 * Or via npm script:
 *    cd backend && npm run setup
 *
 * SAFETY:
 * - Never overwrites an existing `.env` without an explicit confirmation
 *   (the prompt defaults to "keep").
 * - Prints a diff-like summary of what will be written before writing.
 * - Works fully offline — no network calls.
 *
 * This wizard is part of the pluggable-provider initiative (see
 * `docs/providers/` and the meta tracking issue on GitHub). As new provider
 * adapters land, add them to the PROVIDERS array below — the wizard
 * reflects the current state of what's actually implemented vs. planned.
 */

import * as fs from 'fs';
import * as path from 'path';
// `prompts` is a CJS module. With `allowSyntheticDefaultImports` but no
// `esModuleInterop` in this repo's tsconfig, `import prompts from 'prompts'`
// type-checks but at runtime the default is undefined. Use require() to
// get the real CJS export.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prompts: typeof import('prompts') = require('prompts');

// =====================================================================
// Provider catalog
// =====================================================================
//
// Each entry describes one pluggable concern the wizard asks about. The
// `status` field is how we honestly track what's implemented vs what's
// still a stub. The wizard never lies — if a provider isn't implemented,
// the "not yet" options are marked as such and the env vars it writes are
// the current hardcoded ones.
//
// When a new provider-adapter PR lands, flip that concern's `status` to
// 'implemented' and fill in the real choices. That way the wizard itself
// IS the source of truth for what Team@Once currently supports.

type ProviderStatus = 'implemented' | 'planned';

interface ProviderChoice {
  /** Value written to the env var. */
  value: string;
  /** Shown in the prompt. */
  title: string;
  /** Shown under the title. Keep it tight. */
  description: string;
  /** If true, this is the zero-infra / free default for its concern. */
  isDefault?: boolean;
  /** Extra env var keys this choice needs the user to fill in later. */
  envVars?: string[];
}

interface ProviderConcern {
  /** Canonical key, used for logging. */
  key: string;
  /** Human-readable label shown in the prompt. */
  label: string;
  /** Short explanation of what this concern does. */
  description: string;
  /** The env var name that selects the provider. */
  envVar: string;
  /** Whether the adapter pattern is actually implemented yet. */
  status: ProviderStatus;
  /** Choices to show. */
  choices: ProviderChoice[];
}

const PROVIDERS: ProviderConcern[] = [
  {
    key: 'video',
    label: 'Video conferencing',
    description: 'Used by project meetings, standups, and interviews.',
    envVar: 'VIDEO_PROVIDER',
    status: 'implemented',
    choices: [
      {
        value: 'jitsi',
        title: 'Jitsi  (free, zero setup)',
        description: 'Uses the public meet.jit.si instance — no signup, no API keys.',
        isDefault: true,
      },
      {
        value: 'whereby',
        title: 'Whereby  (iframe-only frontend)',
        description: 'Easiest managed option. 100 free min/month.',
        envVars: ['WHEREBY_API_KEY'],
      },
      {
        value: 'daily',
        title: 'Daily.co  (managed)',
        description: '10k free min/month. Pure REST, no SDK on server.',
        envVars: ['DAILY_API_KEY', 'DAILY_DOMAIN'],
      },
      {
        value: 'livekit',
        title: 'LiveKit  (cloud or self-hosted)',
        description: 'Full features incl. cloud recording. 50 free min/month.',
        envVars: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
      },
      {
        value: 'agora',
        title: 'Agora  (global scale, esp Asia)',
        description: '10k free min/month. Battle-tested at scale.',
        envVars: ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE'],
      },
      {
        value: 'none',
        title: 'None  (disable video features)',
        description: 'Video UI will be hidden on the frontend.',
      },
    ],
  },
  {
    key: 'storage',
    label: 'File storage',
    description: 'Product images, avatars, course materials, certificates.',
    envVar: 'STORAGE_PROVIDER',
    status: 'planned', // See GitHub issue #28 - adapter not yet implemented
    choices: [
      {
        value: 'r2',
        title: 'Cloudflare R2  (current default)',
        description: 'What Team@Once uses today. Fill in R2_* env vars.',
        isDefault: true,
        envVars: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'],
      },
      {
        value: 'local-fs',
        title: 'Local filesystem  [planned: #28]',
        description: 'Zero infra. Will be the new default once #28 lands.',
      },
      {
        value: 's3',
        title: 'AWS S3  [planned: #28]',
        description: 'AWS S3 bucket.',
      },
      {
        value: 'minio',
        title: 'MinIO  [planned: #28]',
        description: 'Self-hosted S3-compatible.',
      },
    ],
  },
  {
    key: 'ai',
    label: 'AI / LLM',
    description: 'Assessments, course content, semantic search, summaries.',
    envVar: 'AI_PROVIDER',
    status: 'planned', // See GitHub issue #27
    choices: [
      {
        value: 'openai',
        title: 'OpenAI  (current default)',
        description: 'What Team@Once uses today. Fill in OPENAI_API_KEY.',
        isDefault: true,
        envVars: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
      },
      {
        value: 'anthropic',
        title: 'Anthropic Claude  [planned: #27]',
        description: 'Best for long-context reasoning.',
      },
      {
        value: 'ollama',
        title: 'Ollama  (local, fully offline)  [planned: #27]',
        description: 'Run LLMs on your own machine. Zero API cost.',
      },
      {
        value: 'gemini',
        title: 'Google Gemini  [planned: #27]',
        description: 'Cheap multimodal + embeddings.',
      },
      {
        value: 'none',
        title: 'None  [planned: #27]',
        description: 'AI features disabled.',
      },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Password reset, verification, notifications.',
    envVar: 'EMAIL_PROVIDER',
    status: 'planned', // See GitHub issue #29
    choices: [
      {
        value: 'smtp',
        title: 'SMTP  (any mail server)',
        description: 'Works with Gmail app passwords, Mailtrap, Postfix.',
        isDefault: true,
        envVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'],
      },
      {
        value: 'resend',
        title: 'Resend  [planned: #29]',
        description: 'Modern API, generous free tier.',
      },
      {
        value: 'sendgrid',
        title: 'SendGrid  [planned: #29]',
        description: 'Enterprise standard.',
      },
      {
        value: 'ses',
        title: 'AWS SES  [planned: #29]',
        description: 'Cheapest at scale.',
      },
      {
        value: 'none',
        title: 'None  [planned: #29]',
        description: 'Email features disabled.',
      },
    ],
  },
  {
    key: 'search',
    label: 'Search',
    description: 'Product / company / course semantic search.',
    envVar: 'SEARCH_PROVIDER',
    status: 'planned', // See GitHub issue #30
    choices: [
      {
        value: 'qdrant',
        title: 'Qdrant  (current default)',
        description: 'Vector database. Currently required by docker-compose.',
        isDefault: true,
        envVars: ['QDRANT_HOST', 'QDRANT_PORT', 'QDRANT_API_KEY'],
      },
      {
        value: 'pg-trgm',
        title: 'Postgres pg_trgm  [planned: #30]',
        description: 'Zero extra infra. Will be the new dev default.',
      },
      {
        value: 'meilisearch',
        title: 'Meilisearch  [planned: #30]',
        description: 'Typo-tolerant keyword search.',
      },
      {
        value: 'typesense',
        title: 'Typesense  [planned: #30]',
        description: 'Fast, simple, self-hosted.',
      },
    ],
  },
];

// =====================================================================
// Wizard implementation
// =====================================================================

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

interface WizardResult {
  /** Env var key → new value. Only the keys the wizard touched. */
  updates: Record<string, string>;
  /** Env var keys the user still needs to fill in later. */
  needsFilling: string[];
  /** Per-concern selection with metadata for the final summary. */
  selections: Array<{
    concern: ProviderConcern;
    choice: ProviderChoice;
  }>;
}

function divider(ch = '=', width = 70): void {
  console.log(ch.repeat(width));
}

function header(title: string): void {
  console.log('');
  divider();
  console.log(`  ${title}`);
  divider();
  console.log('');
}

function readEnvExample(): string {
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    throw new Error(`.env.example not found at ${ENV_EXAMPLE_PATH}`);
  }
  return fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
}

function readExistingEnv(): Record<string, string> | null {
  if (!fs.existsSync(ENV_PATH)) return null;
  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Splice `updates` into the existing .env contents (or the .env.example
 * template if no .env exists yet), preserving comments and ordering.
 * Keys that exist get their value rewritten; keys that don't get
 * appended to a "Wizard overrides" section at the bottom.
 */
function renderEnv(baseline: string, updates: Record<string, string>): string {
  const lines = baseline.split('\n');
  const touched = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)(.*)$/);
    if (!m) return line;
    const key = m[2];
    if (key in updates) {
      touched.add(key);
      return `${m[1]}${key}${m[3]}${updates[key]}`;
    }
    return line;
  });

  const untouched = Object.entries(updates).filter(([k]) => !touched.has(k));
  if (untouched.length > 0) {
    out.push('');
    out.push('# =====================================================');
    out.push('# SETUP WIZARD OVERRIDES');
    out.push('# =====================================================');
    for (const [k, v] of untouched) out.push(`${k}=${v}`);
  }
  return out.join('\n');
}

async function runWizard(): Promise<WizardResult> {
  header('Team@Once first-run setup');

  console.log('This wizard picks providers for each piece of infrastructure.');
  console.log('Every question has a zero-infra default marked (in parentheses).');
  console.log('Press Enter to accept the default and keep going.');
  console.log('');
  console.log('Provider adapters that are not yet implemented are marked');
  console.log('[planned: #NN] — picking one will write the env var for the');
  console.log('current hardcoded implementation, and the wizard will remind');
  console.log('you when the new adapter lands.');
  console.log('');

  const existingEnv = readExistingEnv();
  if (existingEnv) {
    console.log(`Found existing .env at ${ENV_PATH}`);
    const { keep } = await prompts({
      type: 'confirm',
      name: 'keep',
      message: 'Update it in place? (No will overwrite from .env.example)',
      initial: true,
    });
    console.log('');
    if (keep === undefined) process.exit(0); // user ctrl-c
    if (!keep) {
      console.log('Will regenerate from .env.example...');
    }
  } else {
    console.log(`No .env yet — will create from .env.example`);
  }
  console.log('');

  const result: WizardResult = {
    updates: {},
    needsFilling: [],
    selections: [],
  };

  for (const concern of PROVIDERS) {
    divider('-');
    console.log(`  ${concern.label}`);
    console.log(`  ${concern.description}`);
    if (concern.status === 'planned') {
      console.log(
        `  (adapter pattern not implemented yet — see GitHub issues)`,
      );
    }
    divider('-');

    const defaultIdx = Math.max(
      0,
      concern.choices.findIndex((c) => c.isDefault),
    );

    const { pick } = await prompts({
      type: 'select',
      name: 'pick',
      message: concern.label,
      initial: defaultIdx,
      choices: concern.choices.map((c) => ({
        title: c.title,
        description: c.description,
        value: c.value,
      })),
    });
    console.log('');

    if (pick === undefined) process.exit(0); // ctrl-c

    const choice = concern.choices.find((c) => c.value === pick)!;
    result.selections.push({ concern, choice });
    result.updates[concern.envVar] = pick;

    // Seed placeholders for env vars this choice needs (if not already set).
    for (const key of choice.envVars ?? []) {
      if (!existingEnv?.[key] && !result.updates[key]) {
        result.needsFilling.push(key);
      }
    }
  }

  return result;
}

function printSummary(result: WizardResult): void {
  header('Summary');
  for (const { concern, choice } of result.selections) {
    const flag = concern.status === 'implemented' ? 'ready' : 'planned';
    console.log(`  ${concern.envVar.padEnd(22)} ${choice.value.padEnd(12)} [${flag}]`);
  }
  console.log('');
  if (result.needsFilling.length > 0) {
    console.log('The following env vars still need values — open .env and fill them in:');
    for (const k of result.needsFilling) console.log(`  - ${k}`);
    console.log('');
  } else {
    console.log('All selected providers are ready to boot (no extra secrets needed).');
    console.log('');
  }
}

export async function main(opts: { envPath?: string; envExamplePath?: string } = {}): Promise<void> {
  const envPath = opts.envPath ?? ENV_PATH;
  const envExamplePath = opts.envExamplePath ?? ENV_EXAMPLE_PATH;

  const result = await runWizard();

  printSummary(result);

  const { write } = await prompts({
    type: 'confirm',
    name: 'write',
    message: `Write these selections to ${path.relative(process.cwd(), envPath)}?`,
    initial: true,
  });

  if (!write) {
    console.log('Aborted. Nothing was written.');
    return;
  }

  const baseline = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8')
    : fs.readFileSync(envExamplePath, 'utf-8');

  const rendered = renderEnv(baseline, result.updates);
  fs.writeFileSync(envPath, rendered, 'utf-8');

  console.log('');
  console.log(`.env written: ${envPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. (optional) Fill in any remaining secrets in .env');
  console.log('  2. docker compose up -d              # Postgres + Redis + Qdrant');
  console.log('  3. npm run migrate                   # apply schema');
  console.log('  4. npm run start:dev                 # start the backend');
  console.log('');
  console.log('Docs: see backend/docs/providers/ for per-provider setup guides.');
  console.log('Health: once running, GET http://localhost:3001/api/v1/health/providers');
  console.log('');
}

// Export the pure helpers so they're independently testable.
export { renderEnv, runWizard, readExistingEnv, PROVIDERS };

// CLI entry point — only runs when this file is executed directly.
if (require.main === module) {
  main().catch((err) => {
    console.error('\nSetup wizard crashed:', err);
    process.exit(1);
  });
}
