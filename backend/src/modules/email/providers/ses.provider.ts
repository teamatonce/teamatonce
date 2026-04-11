/**
 * AWS SES email provider.
 *
 *   EMAIL_PROVIDER=ses
 *   SES_REGION=us-east-1
 *   SES_ACCESS_KEY_ID=AKIA...
 *   SES_SECRET_ACCESS_KEY=...
 *   EMAIL_FROM="Vasty Shop <noreply@yourdomain.com>"
 *
 * The `@aws-sdk/client-ses` package is an OPTIONAL dependency — lazy-loaded
 * inside loadSdk() only when the provider is selected. Listed in
 * optionalDependencies in package.json. Users who pick a different
 * provider never install it.
 *
 * Cheapest email at scale (~$0.10 per 1000 emails). Verify the sending
 * domain in the SES console before sending.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

export class SesProvider implements EmailProvider {
  readonly name = 'ses' as const;
  private readonly logger = new Logger('SesProvider');

  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly from: string;
  private readonly replyTo?: string;

  private sdkLoaded = false;
  private client: any;
  private sendCommandClass: any;

  constructor(config: ConfigService) {
    this.region = config.get<string>('SES_REGION', 'us-east-1');
    this.accessKeyId = config.get<string>('SES_ACCESS_KEY_ID', '');
    this.secretAccessKey = config.get<string>('SES_SECRET_ACCESS_KEY', '');
    this.from = config.get<string>('EMAIL_FROM', 'noreply@example.com');
    this.replyTo = config.get<string>('EMAIL_REPLY_TO');

    if (this.isAvailable()) {
      this.logger.log(`SES provider configured (region=${this.region})`);
    } else {
      this.logger.warn(
        'SES provider selected but SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.accessKeyId && this.secretAccessKey);
  }

  private loadSdk() {
    if (this.sdkLoaded) return;
    if (!this.isAvailable()) {
      throw new EmailProviderNotConfiguredError('ses', this.missingVars());
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@aws-sdk/client-ses');
      this.client = new sdk.SESClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
      this.sendCommandClass = sdk.SendEmailCommand;
      this.sdkLoaded = true;
      this.logger.log('@aws-sdk/client-ses loaded');
    } catch (e: any) {
      throw new Error(
        `SES provider selected but "@aws-sdk/client-ses" is not installed. ` +
          `Run: npm install @aws-sdk/client-ses    Original: ${e.message}`,
      );
    }
  }

  private missingVars(): string[] {
    const out: string[] = [];
    if (!this.accessKeyId) out.push('SES_ACCESS_KEY_ID');
    if (!this.secretAccessKey) out.push('SES_SECRET_ACCESS_KEY');
    return out;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    this.loadSdk();

    const toAddresses = Array.isArray(input.to) ? input.to : [input.to];
    const ccAddresses = input.cc
      ? Array.isArray(input.cc)
        ? input.cc
        : [input.cc]
      : undefined;
    const bccAddresses = input.bcc
      ? Array.isArray(input.bcc)
        ? input.bcc
        : [input.bcc]
      : undefined;

    // SES SendEmailCommand doesn't natively support attachments —
    // attachments require SendRawEmailCommand (MIME-built). For this
    // first iteration, reject attachments loudly so the caller knows.
    if (input.attachments && input.attachments.length > 0) {
      throw new Error(
        'SES provider does not yet support attachments — needs SendRawEmailCommand migration. Use SMTP or another provider for emails with attachments.',
      );
    }

    const command = new this.sendCommandClass({
      Source: input.from ?? this.from,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses,
        BccAddresses: bccAddresses,
      },
      ReplyToAddresses: input.replyTo
        ? [input.replyTo]
        : this.replyTo
          ? [this.replyTo]
          : undefined,
      Message: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: input.html
            ? { Data: input.html, Charset: 'UTF-8' }
            : undefined,
          Text: input.text
            ? { Data: input.text, Charset: 'UTF-8' }
            : undefined,
        },
      },
    });

    const res = await this.client.send(command);
    return {
      messageId: res.MessageId,
      provider: 'ses',
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
