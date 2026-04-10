/**
 * Provider health service.
 *
 * Reports on the runtime status of each pluggable infrastructure concern
 * (video, storage, ai, email, push, payments, search, auth, sandbox,
 * esign — whatever has or will have an adapter). The wizard and the admin
 * "Integrations" page both consume this via `/api/v1/health/providers`.
 *
 * For concerns whose adapter pattern has **already landed** (currently just
 * video — see `docs/providers/video.md`), the service instantiates the
 * provider via its factory and calls `isAvailable()`. For concerns whose
 * adapter is still **planned** (everything else), it falls back to a simple
 * "which env var is set" heuristic for the current hardcoded implementation
 * so self-hosters still see honest state on the page.
 *
 * When a new adapter lands, add it to `concerns` below — one entry per
 * pluggable concern, one line of code each. The shape is intentionally
 * boring so it stays grep-able.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// NOTE: the video provider factory lives on the `feat/multi-provider-video`
// branch (PR #39). Once that merges, import `createVideoProvider` from
// `../teamatonce/communication/providers` and replace the `planned()`
// call for `video` below with a real call through the factory.

export type ProviderStatus =
  | 'ready' // configured, reachable (or doesn't need reachability to work)
  | 'skipped' // not configured, operator explicitly chose 'none' or left blank
  | 'error' // configured but broken — missing creds, factory threw, etc.
  | 'planned'; // concern exists but the adapter pattern isn't implemented yet

export interface ProviderHealth {
  /** Concern key (video / storage / ai / ...). */
  concern: string;
  /** Human label for the admin UI. */
  label: string;
  /** Active provider name (or 'none'). */
  provider: string;
  /** Selector env var for this concern. */
  envVar: string;
  /** Current status. */
  status: ProviderStatus;
  /** Short human-readable explanation (shown under the name in the UI). */
  details: string;
  /** Is the adapter pattern actually wired up yet? */
  adapterImplemented: boolean;
  /** Related GitHub issue for planned work. */
  issue?: number;
}

@Injectable()
export class ProvidersHealthService {
  private readonly logger = new Logger(ProvidersHealthService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Return the full status table — one entry per pluggable concern.
   * Never throws: any per-concern failure is captured in that row.
   */
  getAll(): ProviderHealth[] {
    return [
      // Once PR #39 merges, swap this `planned()` for a real video factory
      // call — see the note at the top of the file.
      this.planned({
        concern: 'video',
        label: 'Video conferencing',
        envVar: 'VIDEO_PROVIDER',
        currentHardcoded: 'jitsi',
        requiredEnvVars: [],
        issue: 33,
      }),
      this.planned({
        concern: 'storage',
        label: 'File storage',
        envVar: 'STORAGE_PROVIDER',
        currentHardcoded: 'r2',
        requiredEnvVars: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
        issue: 28,
      }),
      this.planned({
        concern: 'ai',
        label: 'AI / LLM',
        envVar: 'AI_PROVIDER',
        currentHardcoded: 'openai',
        requiredEnvVars: ['OPENAI_API_KEY'],
        issue: 27,
      }),
      this.planned({
        concern: 'email',
        label: 'Email',
        envVar: 'EMAIL_PROVIDER',
        currentHardcoded: 'smtp',
        requiredEnvVars: ['SMTP_HOST', 'SMTP_USER'],
        issue: 29,
      }),
      this.planned({
        concern: 'search',
        label: 'Search',
        envVar: 'SEARCH_PROVIDER',
        currentHardcoded: 'qdrant',
        requiredEnvVars: ['QDRANT_HOST'],
        issue: 30,
      }),
      this.planned({
        concern: 'push',
        label: 'Push notifications',
        envVar: 'PUSH_PROVIDER',
        currentHardcoded: 'fcm',
        requiredEnvVars: ['FIREBASE_SERVICE_ACCOUNT'],
        issue: 34,
      }),
      this.planned({
        concern: 'payments',
        label: 'Payments + escrow',
        envVar: 'PAYMENT_PROVIDER',
        currentHardcoded: 'stripe',
        requiredEnvVars: ['STRIPE_SECRET_KEY'],
        issue: 35,
      }),
      this.planned({
        concern: 'auth',
        label: 'Auth / SSO',
        envVar: 'AUTH_PROVIDERS',
        currentHardcoded: 'local',
        requiredEnvVars: [],
        issue: 31,
      }),
      this.planned({
        concern: 'sandbox',
        label: 'Code sandbox (assessments)',
        envVar: 'SANDBOX_PROVIDER',
        currentHardcoded: 'none',
        requiredEnvVars: [],
        issue: 36,
      }),
      this.planned({
        concern: 'esign',
        label: 'Contract e-signature',
        envVar: 'ESIGN_PROVIDER',
        currentHardcoded: 'none',
        requiredEnvVars: [],
        issue: 32,
      }),
    ];
  }

  // =====================================================================
  // Per-concern resolver
  // =====================================================================

  /**
   * Heuristic status resolver for concerns whose adapter pattern is still
   * planned. We report `planned` if the env vars for the **current**
   * hardcoded implementation are set, so operators get an honest picture:
   * "the adapter doesn't exist yet, but your existing setup is working."
   */
  private planned(args: {
    concern: string;
    label: string;
    envVar: string;
    currentHardcoded: string;
    requiredEnvVars: string[];
    issue: number;
  }): ProviderHealth {
    const explicit = this.config.get<string>(args.envVar);
    const missing = args.requiredEnvVars.filter(
      (k) => !this.config.get<string>(k),
    );
    const selected = explicit || args.currentHardcoded;

    if (missing.length > 0) {
      return {
        concern: args.concern,
        label: args.label,
        envVar: args.envVar,
        provider: selected,
        status: 'skipped',
        details: `adapter #${args.issue} not yet implemented; current stack needs ${missing.join(', ')}`,
        adapterImplemented: false,
        issue: args.issue,
      };
    }
    return {
      concern: args.concern,
      label: args.label,
      envVar: args.envVar,
      provider: selected,
      status: 'planned',
      details: `adapter #${args.issue} not yet implemented; current hardcoded stack (${args.currentHardcoded}) appears configured`,
      adapterImplemented: false,
      issue: args.issue,
    };
  }
}
