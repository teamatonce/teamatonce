/**
 * MagicLinkService — passwordless email sign-in.
 *
 * Flow:
 *   1. User submits their email at /login → frontend POSTs to
 *      `/api/v1/auth/magic-link/request { email }`
 *   2. Backend signs a short-lived JWT containing { email, purpose:
 *      'magic-link' }, TTL 15 minutes
 *   3. Backend emails the user a link like
 *      `${FRONTEND_URL}/auth/magic-link?token=<jwt>`
 *   4. User clicks the link → frontend POSTs to
 *      `/api/v1/auth/magic-link/verify { token }`
 *   5. Backend verifies the JWT, looks up (or creates) the user,
 *      returns a real access token + refresh token
 *
 * Uses the existing EmailService for SMTP transport and the
 * existing JwtService for token signing — no new deps.
 *
 * Enable by adding 'magic-link' to AUTH_PROVIDERS in .env:
 *
 *   AUTH_PROVIDERS=local,google,magic-link
 *
 * Optional env vars:
 *   MAGIC_LINK_TTL_SECONDS=900       (default 15 min)
 *   MAGIC_LINK_FROM_EMAIL=...        (defaults to EMAIL_FROM)
 *   FRONTEND_URL=http://localhost:5173 (used to build the link)
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../../../services/email.service';

export interface MagicLinkTokenPayload {
  sub: string; // email (subject)
  email: string;
  purpose: 'magic-link';
}

export interface RequestMagicLinkResult {
  /** Always true — we don't leak whether the email exists in the
   * user table. The frontend shows a generic "check your inbox"
   * message regardless of whether the email is registered. */
  success: true;
  /** Debug-only: the signed token. NEVER returned in production —
   * this field is only populated when NODE_ENV !== 'production' so
   * the e2e test and the dev user can debug the flow without waiting
   * on real email delivery. */
  debugToken?: string;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  private readonly ttlSeconds: number;
  private readonly frontendUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {
    this.ttlSeconds = parseInt(
      config.get<string>('MAGIC_LINK_TTL_SECONDS', '900') || '900',
      10,
    );
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    this.isProduction =
      (config.get<string>('NODE_ENV') || 'development').toLowerCase() === 'production';
  }

  /**
   * Sign a magic-link JWT for `email`. The JWT uses the same secret
   * as the regular access token (JwtService is preconfigured), but
   * embeds `purpose: 'magic-link'` so the verify step can reject a
   * stolen token being used at a different endpoint.
   */
  private signToken(email: string): string {
    const payload: MagicLinkTokenPayload = {
      sub: email,
      email,
      purpose: 'magic-link',
    };
    return this.jwtService.sign(payload, {
      expiresIn: this.ttlSeconds,
    });
  }

  /**
   * Verify and decode a magic-link token. Returns the email if valid
   * (correct signature, not expired, purpose === 'magic-link').
   * Throws BadRequestException on any failure.
   */
  verifyToken(token: string): string {
    let payload: MagicLinkTokenPayload;
    try {
      payload = this.jwtService.verify<MagicLinkTokenPayload>(token);
    } catch (e: any) {
      throw new BadRequestException(
        `Magic link token is invalid or expired: ${e.message}`,
      );
    }
    if (payload.purpose !== 'magic-link') {
      throw new BadRequestException('Token purpose mismatch');
    }
    if (!payload.email || !payload.email.includes('@')) {
      throw new BadRequestException('Token missing valid email');
    }
    return payload.email.toLowerCase().trim();
  }

  /**
   * Issue a magic link email. Returns `{ success: true }` regardless
   * of whether the email is registered (to prevent enumeration
   * attacks). In non-production, also returns `debugToken` so the
   * e2e test + dev user can complete the flow without waiting on
   * real email delivery.
   */
  async requestMagicLink(email: string): Promise<RequestMagicLinkResult> {
    const normalized = email.toLowerCase().trim();
    if (!normalized.includes('@')) {
      throw new BadRequestException('Invalid email');
    }

    const token = this.signToken(normalized);
    const link = `${this.frontendUrl.replace(/\/+$/, '')}/auth/magic-link?token=${encodeURIComponent(token)}`;

    const html = this.buildHtml(link);
    const text = `Click to sign in: ${link}\n\nThis link will expire in ${Math.round(this.ttlSeconds / 60)} minutes.\n\nIf you didn't request this, you can safely ignore this email.`;

    try {
      await this.emailService.sendEmail(
        normalized,
        'Your Team@Once sign-in link',
        html,
        text,
      );
      this.logger.log(`Magic link sent to ${normalized}`);
    } catch (e: any) {
      // Log the failure but don't surface it to the caller —
      // prevents email-existence enumeration. The dev can see
      // the failure in the logs.
      this.logger.error(
        `Failed to send magic link to ${normalized}: ${e.message}`,
      );
    }

    return {
      success: true,
      debugToken: this.isProduction ? undefined : token,
    };
  }

  private buildHtml(link: string): string {
    return `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;color:#1a1a1a;">
    <h2 style="color:#2563eb;">Sign in to Team@Once</h2>
    <p>Click the button below to sign in. This link will expire in ${Math.round(this.ttlSeconds / 60)} minutes.</p>
    <p style="text-align:center;margin:32px 0;">
      <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in</a>
    </p>
    <p style="color:#666;font-size:14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break:break-all;color:#2563eb;font-size:14px;">${link}</p>
    <hr style="border:0;border-top:1px solid #eee;margin:32px 0;" />
    <p style="color:#999;font-size:12px;">If you didn't request this sign-in link, you can safely ignore this email.</p>
  </body>
</html>`;
  }
}
