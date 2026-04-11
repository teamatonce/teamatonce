/**
 * EsignService — contract e-signature façade.
 *
 * The contract module should inject this service when a milestone
 * signing step is triggered. Switching providers (documenso →
 * opensign → docusign) is just a matter of changing `ESIGN_PROVIDER`
 * in .env.
 *
 * See `./providers/` and `docs/providers/esign.md`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createEsignProvider,
  CreateEnvelopeInput,
  Envelope,
  EnvelopeInfo,
  EsignProvider,
  WebhookEvent,
} from './providers';

@Injectable()
export class EsignService implements OnModuleInit {
  private readonly logger = new Logger(EsignService.name);
  private provider!: EsignProvider;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.provider = createEsignProvider(this.config);
    this.logger.log(
      `Esign provider initialized: ${this.provider.name} (available=${this.provider.isAvailable()})`,
    );
  }

  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }

  isAvailable(): boolean {
    return !!this.provider && this.provider.isAvailable();
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
    return this.provider.createEnvelope(input);
  }

  async getEnvelope(envelopeId: string): Promise<EnvelopeInfo | null> {
    return this.provider.getEnvelope(envelopeId);
  }

  async downloadSignedPdf(envelopeId: string): Promise<Buffer> {
    return this.provider.downloadSignedPdf(envelopeId);
  }

  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<WebhookEvent | null> {
    return this.provider.parseWebhook(rawBody, signature);
  }

  getProvider(): EsignProvider {
    return this.provider;
  }
}
