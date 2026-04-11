/**
 * Email provider factory.
 *
 * Reads EMAIL_PROVIDER from config and returns the matching provider.
 * Unknown values fall back to 'none' with a warning listing the valid
 * choices.
 *
 * Add a new provider by:
 *   1. Implementing EmailProvider in <name>.provider.ts
 *   2. Adding a case to createEmailProvider() below
 *   3. Documenting env vars in docs/providers/email.md
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EmailProvider } from './email-provider.interface';
import { SmtpProvider } from './smtp.provider';
import { ResendProvider } from './resend.provider';
import { SendgridProvider } from './sendgrid.provider';
import { PostmarkProvider } from './postmark.provider';
import { MailgunProvider } from './mailgun.provider';
import { SesProvider } from './ses.provider';
import { NoneEmailProvider } from './none.provider';

const log = new Logger('EmailProviderFactory');

export function createEmailProvider(config: ConfigService): EmailProvider {
  const choice = (config.get<string>('EMAIL_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'smtp':
    case 'nodemailer': {
      const p = new SmtpProvider(config);
      log.log(`Selected email provider: smtp (available=${p.isAvailable()})`);
      return p;
    }
    case 'resend': {
      const p = new ResendProvider(config);
      log.log(`Selected email provider: resend (available=${p.isAvailable()})`);
      return p;
    }
    case 'sendgrid': {
      const p = new SendgridProvider(config);
      log.log(
        `Selected email provider: sendgrid (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'postmark': {
      const p = new PostmarkProvider(config);
      log.log(
        `Selected email provider: postmark (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'mailgun': {
      const p = new MailgunProvider(config);
      log.log(
        `Selected email provider: mailgun (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'ses':
    case 'aws-ses':
    case 'aws': {
      const p = new SesProvider(config);
      log.log(`Selected email provider: ses (available=${p.isAvailable()})`);
      return p;
    }
    case 'none':
    case '':
      return new NoneEmailProvider();
    default:
      log.warn(
        `Unknown EMAIL_PROVIDER="${choice}". Falling back to "none". Valid values: smtp, resend, sendgrid, postmark, mailgun, ses, none.`,
      );
      return new NoneEmailProvider();
  }
}

export * from './email-provider.interface';
export { SmtpProvider } from './smtp.provider';
export { ResendProvider } from './resend.provider';
export { SendgridProvider } from './sendgrid.provider';
export { PostmarkProvider } from './postmark.provider';
export { MailgunProvider } from './mailgun.provider';
export { SesProvider } from './ses.provider';
export { NoneEmailProvider } from './none.provider';
