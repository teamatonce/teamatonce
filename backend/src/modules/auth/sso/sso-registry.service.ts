/**
 * SsoRegistryService — single source of truth for which SSO / auth
 * providers are enabled in this deployment.
 *
 * Reads `AUTH_PROVIDERS` from .env as a comma-separated list, e.g.:
 *
 *   AUTH_PROVIDERS=local,google,github,magic-link
 *
 * Valid values:
 *
 *   local       - Email + password (always enabled — acts as the
 *                 baseline even if omitted from AUTH_PROVIDERS)
 *   google      - Google OAuth2 (existing `GoogleStrategy`)
 *   github      - GitHub OAuth2 (existing `GitHubStrategy`)
 *   gitlab      - GitLab OAuth2 [planned follow-up]
 *   magic-link  - Email-based passwordless sign-in via MagicLinkStrategy
 *                 (this PR)
 *   keycloak    - OIDC against a self-hosted Keycloak [planned]
 *   clerk       - Clerk-hosted auth (JWT verification) [planned]
 *   auth0       - Auth0-hosted auth (JWT verification) [planned]
 *
 * The frontend calls `GET /api/v1/auth/providers` at page load time
 * to discover which providers to render as login buttons. Unknown
 * values in AUTH_PROVIDERS are logged and ignored — never silently
 * dropped.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AuthProviderKey =
  | 'local'
  | 'google'
  | 'github'
  | 'gitlab'
  | 'magic-link'
  | 'keycloak'
  | 'clerk'
  | 'auth0';

export interface AuthProviderInfo {
  /** Stable provider key. */
  key: AuthProviderKey;
  /** Display name for login buttons. */
  displayName: string;
  /** Whether the provider is enabled in this deployment. */
  enabled: boolean;
  /** Whether the provider's adapter is actually implemented vs planned. */
  implemented: boolean;
  /** Authorization URL for OAuth providers (absent for local/magic-link). */
  authorizationPath?: string;
  /** Icon identifier the frontend can use for branded buttons. */
  icon?: string;
}

/**
 * Static metadata about each provider. Kept separate from runtime
 * enablement so new-provider PRs only need to edit this table.
 */
const PROVIDER_CATALOG: Record<
  AuthProviderKey,
  Omit<AuthProviderInfo, 'enabled'>
> = {
  local: {
    key: 'local',
    displayName: 'Email & Password',
    implemented: true,
    icon: 'mail',
  },
  google: {
    key: 'google',
    displayName: 'Google',
    implemented: true, // existing GoogleStrategy
    authorizationPath: '/api/v1/auth/oauth/google',
    icon: 'google',
  },
  github: {
    key: 'github',
    displayName: 'GitHub',
    implemented: true, // existing GitHubStrategy
    authorizationPath: '/api/v1/auth/oauth/github',
    icon: 'github',
  },
  gitlab: {
    key: 'gitlab',
    displayName: 'GitLab',
    implemented: false, // planned follow-up
    authorizationPath: '/api/v1/auth/oauth/gitlab',
    icon: 'gitlab',
  },
  'magic-link': {
    key: 'magic-link',
    displayName: 'Magic Link',
    implemented: true, // this PR
    authorizationPath: '/api/v1/auth/magic-link/request',
    icon: 'link',
  },
  keycloak: {
    key: 'keycloak',
    displayName: 'Keycloak',
    implemented: false, // planned
    authorizationPath: '/api/v1/auth/oidc/keycloak',
    icon: 'shield',
  },
  clerk: {
    key: 'clerk',
    displayName: 'Clerk',
    implemented: false, // planned
    icon: 'shield',
  },
  auth0: {
    key: 'auth0',
    displayName: 'Auth0',
    implemented: false, // planned
    authorizationPath: '/api/v1/auth/oidc/auth0',
    icon: 'shield',
  },
};

@Injectable()
export class SsoRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SsoRegistryService.name);

  /** Final resolved list of enabled providers for this deployment. */
  private enabled: AuthProviderInfo[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('AUTH_PROVIDERS', '') || '';
    const requested = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // `local` is always enabled — email/password is the baseline.
    const enabledKeys = new Set<AuthProviderKey>(['local']);

    for (const r of requested) {
      if (!(r in PROVIDER_CATALOG)) {
        this.logger.warn(
          `Unknown auth provider "${r}" in AUTH_PROVIDERS — ignoring. Valid values: ${Object.keys(PROVIDER_CATALOG).join(', ')}`,
        );
        continue;
      }
      const key = r as AuthProviderKey;
      if (!PROVIDER_CATALOG[key].implemented) {
        this.logger.warn(
          `Auth provider "${r}" is listed in AUTH_PROVIDERS but its adapter is not yet implemented (see issue #31). Skipping. The frontend's /auth/providers response will NOT include it.`,
        );
        continue;
      }
      enabledKeys.add(key);
    }

    this.enabled = Array.from(enabledKeys).map((key) => ({
      ...PROVIDER_CATALOG[key],
      enabled: true,
    }));

    this.logger.log(
      `SSO registry initialized: ${this.enabled.map((p) => p.key).join(', ')}`,
    );
  }

  /**
   * The full list of enabled providers. Used by the
   * /api/v1/auth/providers endpoint.
   */
  getEnabled(): AuthProviderInfo[] {
    return [...this.enabled];
  }

  /**
   * Is a given provider enabled in this deployment?
   */
  isEnabled(key: AuthProviderKey): boolean {
    return this.enabled.some((p) => p.key === key);
  }

  /**
   * Catalog entry for a provider (metadata only — says nothing about
   * runtime enablement). Used internally by the controller/endpoint
   * layer and by the admin settings UI.
   */
  getCatalog(): Array<AuthProviderInfo> {
    return Object.values(PROVIDER_CATALOG).map((p) => ({
      ...p,
      enabled: this.enabled.some((e) => e.key === p.key),
    }));
  }
}
