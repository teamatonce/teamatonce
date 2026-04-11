/**
 * Mailgun email provider.
 *
 *   EMAIL_PROVIDER=mailgun
 *   MAILGUN_API_KEY=key-...
 *   MAILGUN_DOMAIN=mail.yourdomain.com
 *   EMAIL_FROM="Vasty Shop <noreply@mail.yourdomain.com>"
 *
 * Optional env vars:
 *   MAILGUN_REGION=us   (or 'eu' for the EU region)
 *
 * Pure REST via fetch. Sign up at https://www.mailgun.com and add a
 * domain. Free tier includes 100 emails/day for 30 days.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

export class MailgunProvider implements EmailProvider {
  readonly name = 'mailgun' as const;
  private readonly logger = new Logger('MailgunProvider');

  private readonly apiKey: string;
  private readonly domain: string;
  private readonly region: 'us' | 'eu';
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('MAILGUN_API_KEY', '');
    this.domain = config.get<string>('MAILGUN_DOMAIN', '');
    const rawRegion = config.get<string>('MAILGUN_REGION', 'us').toLowerCase();
    this.region = rawRegion === 'eu' ? 'eu' : 'us';
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log(
        `Mailgun provider configured (domain=${this.domain}, region=${this.region})`,
      );
    } else {
      this.logger.warn(
        'Mailgun provider selected but MAILGUN_API_KEY or MAILGUN_DOMAIN missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.apiKey && this.domain);
  }

  private baseUrl(): string {
    return this.region === 'eu'
      ? `https://api.eu.mailgun.net/v3/${this.domain}`
      : `https://api.mailgun.net/v3/${this.domain}`;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError(
        'mailgun',
        this.missingVars(),
      );
    }

    // Mailgun /messages expects application/x-www-form-urlencoded for
    // simple sends (or multipart/form-data for attachments). Use
    // multipart so attachment support is uniform.
    const form = new FormData();
    form.append('from', input.from ?? this.from);
    (Array.isArray(input.to) ? input.to : [input.to]).forEach((t) =>
      form.append('to', t),
    );
    if (input.cc) {
      (Array.isArray(input.cc) ? input.cc : [input.cc]).forEach((c) =>
        form.append('cc', c),
      );
    }
    if (input.bcc) {
      (Array.isArray(input.bcc) ? input.bcc : [input.bcc]).forEach((b) =>
        form.append('bcc', b),
      );
    }
    form.append('subject', input.subject);
    if (input.text) form.append('text', input.text);
    if (input.html) form.append('html', input.html);
    if (input.replyTo ?? this.replyTo) {
      form.append('h:Reply-To', input.replyTo ?? this.replyTo ?? '');
    }
    if (input.headers) {
      for (const [k, v] of Object.entries(input.headers)) {
        form.append(`h:${k}`, v);
      }
    }
    if (input.tags) {
      for (const [k, v] of Object.entries(input.tags)) {
        form.append(`v:${k}`, v);
      }
    }
    if (input.attachments) {
      for (const a of input.attachments) {
        form.append(
          'attachment',
          // Convert Buffer → Uint8Array → Blob for undici-compatible FormData.
          new Blob([new Uint8Array(a.content)], {
            type: a.contentType ?? 'application/octet-stream',
          }),
          a.filename,
        );
      }
    }

    const res = await fetch(`${this.baseUrl()}/messages`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`api:${this.apiKey}`).toString('base64'),
      },
      body: form,
    });

    const body = (await res.json()) as { id?: string };
    if (!res.ok) {
      throw new Error(
        `Mailgun API failed: ${res.status} ${JSON.stringify(body)}`,
      );
    }
    return {
      messageId: body.id ?? `mailgun-${Date.now()}`,
      provider: 'mailgun',
      accepted: true,
    };
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    const results: SendEmailResult[] = [];
    for (const input of inputs) {
      results.push(await this.send(input));
    }
    return results;
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.apiKey) out.push('MAILGUN_API_KEY');
    if (!this.domain) out.push('MAILGUN_DOMAIN');
    return out;
  }
}
