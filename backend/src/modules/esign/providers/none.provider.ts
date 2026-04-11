/**
 * "None" esign provider — e-signature is disabled.
 *
 * The default if ESIGN_PROVIDER is unset. Every method throws
 * EsignProviderNotConfiguredError so contract flows fail loudly
 * rather than silently returning empty envelopes.
 */
import { Logger } from '@nestjs/common';
import {
  CreateEnvelopeInput,
  Envelope,
  EnvelopeInfo,
  EsignProvider,
  EsignProviderNotConfiguredError,
  WebhookEvent,
} from './esign-provider.interface';

export class NoneEsignProvider implements EsignProvider {
  readonly name = 'none' as const;
  private readonly logger = new Logger('NoneEsignProvider');

  constructor() {
    this.logger.log(
      'E-signature is DISABLED (ESIGN_PROVIDER not set). To enable, set ESIGN_PROVIDER to one of: documenso, opensign. See docs/providers/esign.md.',
    );
  }

  isAvailable(): boolean {
    return false;
  }

  private fail(op: string): never {
    throw new EsignProviderNotConfiguredError('none', [
      `ESIGN_PROVIDER (currently unset) - cannot ${op}`,
    ]);
  }

  async createEnvelope(_input: CreateEnvelopeInput): Promise<Envelope> {
    return this.fail('createEnvelope');
  }
  async getEnvelope(_envelopeId: string): Promise<EnvelopeInfo | null> {
    return null;
  }
  async downloadSignedPdf(_envelopeId: string): Promise<Buffer> {
    return this.fail('downloadSignedPdf');
  }
  async parseWebhook(
    _rawBody: string,
    _signature?: string,
  ): Promise<WebhookEvent | null> {
    return null;
  }
}
