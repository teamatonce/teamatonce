/**
 * SMTP email provider (via nodemailer).
 *
 * Works with any SMTP server: Gmail app passwords, Mailtrap for dev,
 * Postfix, Resend's SMTP bridge, SendGrid SMTP, self-hosted, etc. Zero
 * vendor lock-in.
 *
 * Required env vars:
 *   SMTP_HOST       e.g. smtp.gmail.com, smtp.resend.com, mailtrap.io
 *   SMTP_PORT       587 (STARTTLS) or 465 (implicit TLS) or 25
 *   EMAIL_FROM      default From address, e.g. "Vasty Shop <noreply@...>"
 *
 * Optional env vars:
 *   SMTP_USER       username / API key user (leave blank for anon relays)
 *   SMTP_PASSWORD   password / API key
 *   SMTP_SECURE     "true" for port 465 implicit TLS; defaults to false
 *   EMAIL_REPLY_TO  default Reply-To header
 *
 * Nodemailer is in `dependencies` (already used by database/email-helpers.ts)
 * so this provider does NOT need lazy loading.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private readonly logger = new Logger('SmtpProvider');

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly secure: boolean;
  private readonly from: string;
  private readonly replyTo?: string;

  private transporter?: nodemailer.Transporter;

  constructor(config: ConfigService) {
    this.host = config.get<string>('SMTP_HOST', '');
    this.port = parseInt(config.get<string>('SMTP_PORT', '587'), 10);
    this.user = config.get<string>('SMTP_USER', '');
    this.password = config.get<string>('SMTP_PASSWORD', '');
    this.secure =
      String(config.get<string>('SMTP_SECURE', 'false')).toLowerCase() ===
      'true';
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log(`SMTP provider configured: ${this.host}:${this.port}`);
    } else {
      this.logger.warn('SMTP provider selected but SMTP_HOST missing');
    }
  }

  isAvailable(): boolean {
    return !!this.host;
  }

  private getTransport(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError('smtp', ['SMTP_HOST']);
    }
    this.transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: this.user
        ? { user: this.user, pass: this.password }
        : undefined,
    });
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.getTransport().sendMail({
      from: input.from ?? this.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo ?? this.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return {
      messageId: info.messageId,
      provider: 'smtp',
      accepted: (info.accepted?.length ?? 0) > 0,
    };
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    // SMTP has no native batch API — just loop send().
    const results: SendEmailResult[] = [];
    for (const input of inputs) {
      results.push(await this.send(input));
    }
    return results;
  }
}
