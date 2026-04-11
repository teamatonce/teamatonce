/**
 * Postmark email provider.
 *
 *   EMAIL_PROVIDER=postmark
 *   POSTMARK_SERVER_TOKEN=...
 *   EMAIL_FROM="Vasty Shop <noreply@yourdomain.com>"
 *
 * Pure REST via fetch. Postmark is known for top-tier deliverability on
 * transactional email. 100-emails/month free tier.
 *
 * Sign up at https://postmarkapp.com, create a Server, copy its Server API Token.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

const POSTMARK_API_BASE = 'https://api.postmarkapp.com';

export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark' as const;
  private readonly logger = new Logger('PostmarkProvider');

  private readonly serverToken: string;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: ConfigService) {
    this.serverToken = config.get<string>('POSTMARK_SERVER_TOKEN', '');
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log('Postmark provider configured');
    } else {
      this.logger.warn(
        'Postmark provider selected but POSTMARK_SERVER_TOKEN missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.serverToken;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError('postmark', [
        'POSTMARK_SERVER_TOKEN',
      ]);
    }

    const payload: any = {
      From: input.from ?? this.from,
      To: Array.isArray(input.to) ? input.to.join(', ') : input.to,
      Cc: input.cc
        ? Array.isArray(input.cc)
          ? input.cc.join(', ')
          : input.cc
        : undefined,
      Bcc: input.bcc
        ? Array.isArray(input.bcc)
          ? input.bcc.join(', ')
          : input.bcc
        : undefined,
      ReplyTo: input.replyTo ?? this.replyTo,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      Headers: input.headers
        ? Object.entries(input.headers).map(([Name, Value]) => ({ Name, Value }))
        : undefined,
      Metadata: input.tags,
      Attachments: input.attachments?.map((a) => ({
        Name: a.filename,
        Content: a.content.toString('base64'),
        ContentType: a.contentType ?? 'application/octet-stream',
      })),
    };

    const res = await fetch(`${POSTMARK_API_BASE}/email`, {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': this.serverToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as {
      MessageID?: string;
      ErrorCode?: number;
    };
    if (!res.ok) {
      throw new Error(
        `Postmark API failed: ${res.status} ${JSON.stringify(body)}`,
      );
    }
    return {
      messageId: body.MessageID ?? `postmark-${Date.now()}`,
      provider: 'postmark',
      accepted: body.ErrorCode === 0,
    };
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    // Postmark has a /email/batch endpoint. For simplicity, we loop —
    // Postmark's rate limits are generous and the REST round-trips are fast.
    const results: SendEmailResult[] = [];
    for (const input of inputs) {
      results.push(await this.send(input));
    }
    return results;
  }
}
