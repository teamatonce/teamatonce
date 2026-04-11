/**
 * Common interface that every email provider implements.
 *
 * Pick a provider by setting EMAIL_PROVIDER in your .env to one of:
 *
 *   smtp      - Any SMTP server via nodemailer (Gmail app passwords,
 *               Mailtrap, Postfix, Resend SMTP, SendGrid SMTP, etc.).
 *               The default. Zero vendor lock-in.
 *
 *   resend    - Resend REST API. Modern, generous free tier.
 *
 *   sendgrid  - SendGrid REST API. Enterprise standard.
 *
 *   postmark  - Postmark REST API. Strong deliverability for transactional.
 *
 *   ses       - AWS SES via @aws-sdk/client-ses (optional dependency,
 *               lazy-loaded). Cheapest at scale.
 *
 *   mailgun   - Mailgun REST API. Solid EU / global option.
 *
 *   none      - Email disabled. Every method throws loudly.
 *               The default if EMAIL_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/email.md.
 */

export interface EmailAttachment {
  /** Filename shown in the email client. */
  filename: string;
  /** Raw content bytes. */
  content: Buffer;
  /** MIME type, e.g. 'application/pdf'. */
  contentType?: string;
}

export interface SendEmailInput {
  /** Recipient(s). Provider will fan out if multiple. */
  to: string | string[];
  /** Subject line. */
  subject: string;
  /** HTML body. At least one of html/text must be provided. */
  html?: string;
  /** Plain text body. */
  text?: string;
  /** From address override. Defaults to EMAIL_FROM env var. */
  from?: string;
  /** Reply-To header override. */
  replyTo?: string;
  /** CC recipients. */
  cc?: string | string[];
  /** BCC recipients. */
  bcc?: string | string[];
  /** File attachments. */
  attachments?: EmailAttachment[];
  /** Custom headers (provider-dependent). */
  headers?: Record<string, string>;
  /** Arbitrary tags / metadata (provider-dependent). */
  tags?: Record<string, string>;
}

export interface SendEmailResult {
  /** Provider-specific message id (for tracking / idempotency). */
  messageId: string;
  /** The provider that handled the send. */
  provider: string;
  /** True if the provider accepted the message. */
  accepted: boolean;
}

/**
 * Common interface implemented by every email provider. Methods a provider
 * can't support should throw EmailProviderNotSupportedError — never
 * silently no-op.
 */
export interface EmailProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'smtp'
    | 'resend'
    | 'sendgrid'
    | 'postmark'
    | 'ses'
    | 'mailgun'
    | 'none';

  /** True if the provider has the credentials it needs to function. */
  isAvailable(): boolean;

  /** Send a single email. */
  send(input: SendEmailInput): Promise<SendEmailResult>;

  /**
   * Send many emails in one batch. Default implementation just loops
   * `send()`; providers with a real batch API (Resend, SendGrid) override.
   */
  sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]>;
}

/**
 * Thrown when a provider is asked to do something it doesn't support
 * (e.g. templated sends on a provider without templates).
 */
export class EmailProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" email provider. See docs/providers/email.md for provider capabilities.`,
    );
    this.name = 'EmailProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class EmailProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Email provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/email.md.`,
    );
    this.name = 'EmailProviderNotConfiguredError';
  }
}
