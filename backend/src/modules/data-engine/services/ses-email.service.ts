import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface OutreachEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface OutreachEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SesEmailService implements OnModuleInit {
  private readonly logger = new Logger(SesEmailService.name);
  private transporter: Transporter | null = null;
  private defaultFrom: string;
  private defaultFromName: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('SES_SMTP_HOST');
    const port = this.configService.get<number>('SES_SMTP_PORT');
    const user = this.configService.get<string>('SES_SMTP_USER');
    const pass = this.configService.get<string>('SES_SMTP_PASS');

    this.defaultFrom = this.configService.get<string>('SES_FROM_ADDRESS') || 'noreply@promoatonce.com';
    this.defaultFromName = this.configService.get<string>('SES_FROM_NAME') || 'Team@Once';

    if (!host || !user || !pass) {
      this.logger.warn('AWS SES SMTP not configured. Outreach email service will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: false, // STARTTLS
      auth: {
        user,
        pass,
      },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      this.logger.log(`AWS SES SMTP connected: ${host}:${port}`);
      this.logger.log(`Default from: ${this.defaultFromName} <${this.defaultFrom}>`);
    } catch (error) {
      this.logger.error(`AWS SES SMTP connection failed: ${error.message}`);
      this.transporter = null;
    }
  }

  /**
   * Check if the service is properly configured and connected
   */
  isConfigured(): boolean {
    return !!this.transporter;
  }

  /**
   * Send a single outreach email via AWS SES
   */
  async sendEmail(options: OutreachEmailOptions): Promise<OutreachEmailResult> {
    if (!this.transporter) {
      return { success: false, error: 'SES not configured' };
    }

    const fromAddress = options.from || this.defaultFrom;
    const fromName = options.fromName || this.defaultFromName;

    try {
      const result = await this.transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        headers: options.tags
          ? Object.entries(options.tags).reduce(
              (acc, [key, value]) => {
                acc[`X-SES-MESSAGE-TAGS`] = `${key}=${value}`;
                return acc;
              },
              {} as Record<string, string>,
            )
          : undefined,
      });

      this.logger.debug(`Email sent to ${options.to}: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send emails to multiple recipients (one at a time for SES compliance)
   */
  async sendBulkEmails(
    emails: OutreachEmailOptions[],
    options: { delayMs?: number } = {},
  ): Promise<{ sent: number; failed: number; results: OutreachEmailResult[] }> {
    const delayMs = options.delayMs || 100; // SES rate limit: 14 emails/sec
    const results: OutreachEmailResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const email of emails) {
      const result = await this.sendEmail(email);
      results.push(result);

      if (result.success) {
        sent++;
      } else {
        failed++;
      }

      // Delay between sends to respect SES rate limits
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.logger.log(`Bulk email complete: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };
  }

  /**
   * Send a test email to verify SES configuration
   */
  async sendTestEmail(to: string): Promise<OutreachEmailResult> {
    return this.sendEmail({
      to,
      subject: 'Team@Once - SES Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">AWS SES Configuration Test</h2>
          <p>This is a test email from the TeamAtOnce outreach system.</p>
          <p>If you received this, your AWS SES SMTP configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">
            Sent from: ${this.defaultFromName} &lt;${this.defaultFrom}&gt;<br/>
            Sent at: ${new Date().toISOString()}
          </p>
        </div>
      `,
      text: `AWS SES Configuration Test\n\nThis is a test email from the TeamAtOnce outreach system.\nIf you received this, your AWS SES SMTP configuration is working correctly.\n\nSent from: ${this.defaultFromName} <${this.defaultFrom}>\nSent at: ${new Date().toISOString()}`,
    });
  }

  /**
   * Get current configuration info (safe to expose)
   */
  getConfigInfo(): Record<string, any> {
    return {
      configured: this.isConfigured(),
      host: this.configService.get<string>('SES_SMTP_HOST') || 'not set',
      port: this.configService.get<number>('SES_SMTP_PORT') || 587,
      region: this.configService.get<string>('SES_REGION') || 'us-east-1',
      defaultFrom: `${this.defaultFromName} <${this.defaultFrom}>`,
    };
  }
}
