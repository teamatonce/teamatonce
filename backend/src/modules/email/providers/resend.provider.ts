/**
 * Resend email provider.
 *
 *   EMAIL_PROVIDER=resend
 *   RESEND_API_KEY=re_...
 *   EMAIL_FROM="Vasty Shop <noreply@yourdomain.com>"
 *
 * Pure REST via fetch — no SDK dep needed on the server. Resend has a
 * generous free tier (3,000 emails/month) and a clean modern API.
 *
 * Sign up at https://resend.com and verify a sending domain.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

const RESEND_API_BASE = 'https://api.resend.com';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly logger = new Logger('ResendProvider');

  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY', '');
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log('Resend provider configured');
    } else {
      this.logger.warn('Resend provider selected but RESEND_API_KEY missing');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private async resendApi(path: string, body: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError('resend', ['RESEND_API_KEY']);
    }
    const res = await fetch(`${RESEND_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend API ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const payload: any = {
      from: input.from ?? this.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo ?? this.replyTo,
      cc: input.cc,
      bcc: input.bcc,
      headers: input.headers,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
        : undefined,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      })),
    };
    const res = await this.resendApi('/emails', payload);
    return {
      messageId: res.id,
      provider: 'resend',
      accepted: true,
    };
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    // Resend has a /emails/batch endpoint (max 100 per call). For
    // simplicity, just fan out individual sends — the REST calls are
    // independently rate-limited and fast enough.
    const results: SendEmailResult[] = [];
    for (const input of inputs) {
      results.push(await this.send(input));
    }
    return results;
  }
}
