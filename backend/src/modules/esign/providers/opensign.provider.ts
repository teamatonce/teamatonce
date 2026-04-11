/**
 * OpenSign e-sign provider.
 *
 *   ESIGN_PROVIDER=opensign
 *   OPENSIGN_URL=https://app.opensignlabs.com        # or self-hosted
 *   OPENSIGN_API_KEY=...
 *
 * OpenSign (https://opensignlabs.com) is another open-source
 * e-signature alternative. Self-hostable with docker or consumable
 * via their managed cloud. Parse Server backend under the hood.
 *
 * OpenSign's API uses their `/api/app/*` REST endpoints with an
 * X-Parse-Master-Key header. This provider implements the minimal
 * surface needed for Team@Once's contract signing flow:
 *   createEnvelope → POST /api/app/functions/signdocuments
 *   getEnvelope    → POST /api/app/functions/getdocumentdetails
 *   downloadSignedPdf → GET the document's signed_url
 *
 * THIS IS A FIRST-PASS INTEGRATION. OpenSign's API surface is less
 * standardized than Documenso's; the exact endpoint shapes vary
 * between self-hosted versions. Smoke-tested with mocked fetch
 * — real API responses may need minor tweaks.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateEnvelopeInput,
  Envelope,
  EnvelopeInfo,
  EnvelopeStatus,
  EsignProvider,
  EsignProviderNotConfiguredError,
  EsignProviderNotSupportedError,
  WebhookEvent,
} from './esign-provider.interface';

export class OpenSignProvider implements EsignProvider {
  readonly name = 'opensign' as const;
  private readonly logger = new Logger('OpenSignProvider');

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('OPENSIGN_URL', 'https://app.opensignlabs.com') ||
      'https://app.opensignlabs.com'
    ).replace(/\/+$/, '');
    this.apiKey = config.get<string>('OPENSIGN_API_KEY', '');

    if (this.isAvailable()) {
      this.logger.log(`OpenSign provider configured (${this.baseUrl})`);
    } else {
      this.logger.warn(
        'OpenSign provider selected but OPENSIGN_API_KEY missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private async opensignApi(path: string, body: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new EsignProviderNotConfiguredError('opensign', [
        'OPENSIGN_API_KEY',
      ]);
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': 'opensign',
        'X-Parse-Master-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `OpenSign API ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
    const res = await this.opensignApi('/api/app/functions/signdocuments', {
      title: input.title,
      description: input.message ?? '',
      file: input.documentPdf.toString('base64'),
      filename: input.filename ?? 'contract.pdf',
      signers: input.signers.map((s, i) => ({
        Email: s.email,
        Name: s.name,
        Role: s.role ?? 'Signer',
        order: s.signingOrder ?? i + 1,
      })),
      reference: input.externalReference,
    });

    return {
      envelopeId: String(res.result?.documentId ?? res.result?.objectId ?? ''),
      provider: 'opensign',
      status: 'pending',
      signingUrlFirstSigner: res.result?.signUrl,
    };
  }

  async getEnvelope(envelopeId: string): Promise<EnvelopeInfo | null> {
    try {
      const res = await this.opensignApi(
        '/api/app/functions/getdocumentdetails',
        { documentId: envelopeId },
      );
      const doc = res.result;
      if (!doc) return null;
      return {
        envelopeId: String(doc.objectId ?? envelopeId),
        status: this.mapStatus(doc.Status),
        createdAt: doc.createdAt,
        completedAt: doc.completedAt,
        signers: (doc.Signers ?? []).map((s: any) => ({
          email: s.Email,
          name: s.Name,
          status:
            s.Status === 'signed'
              ? ('signed' as const)
              : s.Status === 'declined'
                ? ('declined' as const)
                : ('pending' as const),
          signedAt: s.signedAt,
        })),
        provider: 'opensign',
      };
    } catch (e: any) {
      if (/404/.test(e.message)) return null;
      throw e;
    }
  }

  async downloadSignedPdf(envelopeId: string): Promise<Buffer> {
    const info = await this.getEnvelope(envelopeId);
    if (!info || info.status !== 'completed') {
      throw new Error(
        `OpenSign envelope ${envelopeId} not completed (status=${info?.status ?? 'unknown'})`,
      );
    }
    // OpenSign exposes signed document via a signed URL on the
    // document record. Re-fetching via a dedicated download
    // endpoint is server-version-dependent. For the first pass,
    // callers should use the signing URL to see the completed
    // document in the OpenSign UI.
    throw new EsignProviderNotSupportedError(
      'opensign',
      'downloadSignedPdf (OpenSign download endpoints vary by version — fetch the signed URL from the document record manually, or wait for a follow-up that wires it up properly)',
    );
  }

  async parseWebhook(
    _rawBody: string,
    _signature?: string,
  ): Promise<WebhookEvent | null> {
    // OpenSign's webhook format is not yet wired here — a follow-up
    // PR will parse their native event shape.
    return null;
  }

  private mapStatus(raw?: string): EnvelopeStatus {
    switch ((raw ?? '').toLowerCase()) {
      case 'draft':
        return 'draft';
      case 'waiting':
      case 'pending':
      case 'inprogress':
        return 'pending';
      case 'signed':
      case 'completed':
        return 'completed';
      case 'declined':
      case 'rejected':
        return 'declined';
      case 'expired':
        return 'expired';
      case 'voided':
        return 'voided';
      default:
        return 'unknown';
    }
  }
}
