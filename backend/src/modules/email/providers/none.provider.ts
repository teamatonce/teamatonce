/**
 * "None" email provider — email is disabled.
 *
 * The default if EMAIL_PROVIDER is unset. Every method throws
 * EmailProviderNotConfiguredError so calling code fails loudly rather
 * than silently no-opping. The startup log prints a clear message
 * telling the operator which env var to set to enable email.
 */
import { Logger } from '@nestjs/common';
import {
  EmailProvider,
  EmailProviderNotConfiguredError,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

export class NoneEmailProvider implements EmailProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneEmailProvider');

  constructor() {
    this.logger.log(
      'Email is DISABLED (EMAIL_PROVIDER not set). To enable, set EMAIL_PROVIDER to one of: smtp, resend, sendgrid, postmark, ses, mailgun. See docs/providers/email.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new EmailProviderNotConfiguredError('none', [
      `EMAIL_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async send(_input: SendEmailInput): Promise<SendEmailResult> {
    return this.fail('send');
  }

  async sendBulk(_inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    return this.fail('sendBulk');
  }
}
