/**
 * EmailService — the app's transactional email façade.
 *
 * Every module that needs to send email (auth verification, password
 * reset, order confirmation, shipment tracking, vendor notifications,
 * refund updates, etc.) should inject EmailService and call `send()`.
 *
 * Internally this dispatches to whichever provider the operator has
 * selected via EMAIL_PROVIDER in .env. See `./providers/` and
 * `docs/providers/email.md` for the full list (smtp, resend, sendgrid,
 * postmark, ses, mailgun, none).
 *
 * Backwards compatibility: `backend/src/modules/database/email-helpers.ts`
 * continues to exist and is still used by `DatabaseService.sendEmail()`.
 * Once all call sites migrate to EmailService, the old helper can be
 * deleted in a follow-up PR.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createEmailProvider,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from './providers';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private provider!: EmailProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createEmailProvider(this.config);
    this.logger.log(
      `Email provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  /** Send a single transactional email. */
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    this.logger.log(
      `send subject="${input.subject}" to=${Array.isArray(input.to) ? input.to.join(',') : input.to} via=${this.provider.name}`,
    );
    return this.provider.send(input);
  }

  /** Send many emails. Providers with a native batch API override this. */
  async sendBulk(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    this.logger.log(
      `sendBulk count=${inputs.length} via=${this.provider.name}`,
    );
    return this.provider.sendBulk(inputs);
  }

  /**
   * Direct access to the underlying provider for advanced call sites.
   * Prefer the higher-level methods above.
   */
  getProvider(): EmailProvider {
    return this.provider;
  }
}
