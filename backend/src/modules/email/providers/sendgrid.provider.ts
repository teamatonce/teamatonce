/**
 * SendGrid email provider.
 *
 *   EMAIL_PROVIDER=sendgrid
 *   SENDGRID_API_KEY=SG....
 *   EMAIL_FROM="Vasty Shop <noreply@yourdomain.com>"
 *
 * Pure REST via fetch — no SDK dep needed. SendGrid is the enterprise
 * standard for transactional email, with solid deliverability and a
 * 100-emails/day free tier.
 *
 * Sign up at https://sendgrid.com and verify a sender identity.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

export class SendgridProvider implements EmailProvider {
  readonly name = 'sendgrid' as const;
  private readonly logger = new Logger('SendgridProvider');

  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('SENDGRID_API_KEY', '');
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log('SendGrid provider configured');
    } else {
      this.logger.warn(
        'SendGrid provider selected but SENDGRID_API_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Parse a From-like string of either "Name <addr@host>" or plain
   * "addr@host" into SendGrid's { email, name } object.
   */
  private parseAddress(addr: string): { email: string; name?: string } {
    const m = /^\s*(.+?)\s*<(.+?)>\s*$/.exec(addr);
    if (m) return { name: m[1], email: m[2] };
    return { email: addr.trim() };
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError('sendgrid', [
        'SENDGRID_API_KEY',
      ]);
    }

    const toList = Array.isArray(input.to) ? input.to : [input.to];
    const contents: any[] = [];
    if (input.text) contents.push({ type: 'text/plain', value: input.text });
    if (input.html) contents.push({ type: 'text/html', value: input.html });

    const payload: any = {
      personalizations: [
        {
          to: toList.map((t) => this.parseAddress(t)),
          cc: input.cc
            ? (Array.isArray(input.cc) ? input.cc : [input.cc]).map((a) =>
                this.parseAddress(a),
              )
            : undefined,
          bcc: input.bcc
            ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]).map((a) =>
                this.parseAddress(a),
              )
            : undefined,
          subject: input.subject,
        },
      ],
      from: this.parseAddress(input.from ?? this.from),
      reply_to: input.replyTo
        ? this.parseAddress(input.replyTo)
        : this.replyTo
          ? this.parseAddress(this.replyTo)
          : undefined,
      content: contents,
      headers: input.headers,
      custom_args: input.tags,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        type: a.contentType,
        disposition: 'attachment',
      })),
    };

    const res = await fetch(`${SENDGRID_API_BASE}/mail/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SendGrid API failed: ${res.status} ${text}`);
    }

    // SendGrid returns 202 Accepted with an X-Message-Id header.
    const messageId = res.headers.get('x-message-id') ?? `sendgrid-${Date.now()}`;
    return {
      messageId,
      provider: 'sendgrid',
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
}
