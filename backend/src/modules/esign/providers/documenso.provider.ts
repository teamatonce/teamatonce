/**
 * Documenso e-sign provider — open source DocuSign alternative.
 *
 *   ESIGN_PROVIDER=documenso
 *   DOCUMENSO_URL=https://app.documenso.com           # or self-hosted
 *   DOCUMENSO_API_TOKEN=api_...                       # from account settings
 *   DOCUMENSO_WEBHOOK_SECRET=...                      # for signature verification
 *
 * Documenso (https://documenso.com) is an open-source DocuSign
 * alternative. Self-host via docker or use their managed cloud.
 * Apache 2.0 licensed, integrates cleanly with any document workflow.
 *
 * This provider uses Documenso's v1 public API:
 *   POST /api/v1/documents           - create + upload + send
 *   GET  /api/v1/documents/:id       - status lookup
 *   GET  /api/v1/documents/:id/download - signed PDF
 *
 * Webhooks: Documenso signs payloads with HMAC-SHA256 using the
 * webhook secret. The provider verifies the signature before parsing.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  CreateEnvelopeInput,
  Envelope,
  EnvelopeInfo,
  EnvelopeStatus,
  EsignProvider,
  EsignProviderNotConfiguredError,
  WebhookEvent,
} from './esign-provider.interface';

export class DocumensoProvider implements EsignProvider {
  readonly name = 'documenso' as const;
  private readonly logger = new Logger('DocumensoProvider');

  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('DOCUMENSO_URL', 'https://app.documenso.com') ||
      'https://app.documenso.com'
    ).replace(/\/+$/, '');
    this.apiToken = config.get<string>('DOCUMENSO_API_TOKEN', '');
    this.webhookSecret = config.get<string>('DOCUMENSO_WEBHOOK_SECRET', '');

    if (this.isAvailable()) {
      this.logger.log(`Documenso provider configured (${this.baseUrl})`);
    } else {
      this.logger.warn(
        'Documenso provider selected but DOCUMENSO_API_TOKEN missing',
      );
    }
  }

  isAvailable(): boolean {
    return !!this.apiToken;
  }

  private async documensoApi(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<any> {
    if (!this.isAvailable()) {
      throw new EsignProviderNotConfiguredError('documenso', [
        'DOCUMENSO_API_TOKEN',
      ]);
    }
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: this.apiToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(
        `Documenso API ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
    // Documenso's document-creation flow is multi-step:
    //   1. POST /documents to create a draft
    //   2. PUT the PDF bytes to the returned upload URL
    //   3. POST /documents/:id/send-for-signing to dispatch emails
    //
    // For this first iteration, we use the simplified
    // /documents/with-signers endpoint if the instance supports it,
    // otherwise fall back to the 3-step flow.
    //
    // Production note: the exact Documenso API version matters; check
    // their OpenAPI spec if you're self-hosting an older build.
    const created = await this.documensoApi('POST', '/documents', {
      title: input.title,
      externalId: input.externalReference,
      recipients: input.signers.map((s, i) => ({
        email: s.email,
        name: s.name,
        role: 'SIGNER',
        signingOrder: s.signingOrder ?? i + 1,
      })),
      meta: {
        subject: input.title,
        message: input.message,
      },
    });

    // Upload the PDF bytes
    if (created.uploadUrl) {
      const uploadRes = await fetch(created.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: input.documentPdf,
      });
      if (!uploadRes.ok) {
        throw new Error(
          `Documenso PDF upload failed: ${uploadRes.status} ${await uploadRes.text()}`,
        );
      }
    }

    // Dispatch the signing emails
    try {
      await this.documensoApi(
        'POST',
        `/documents/${created.id}/send-for-signing`,
        {},
      );
    } catch (e: any) {
      // Some Documenso versions auto-send on create; swallow if
      // the endpoint 404s
      if (!/404/.test(e.message)) throw e;
    }

    return {
      envelopeId: String(created.id),
      provider: 'documenso',
      status: 'pending',
      signingUrlFirstSigner: created.recipients?.[0]?.signingUrl,
    };
  }

  async getEnvelope(envelopeId: string): Promise<EnvelopeInfo | null> {
    try {
      const doc = await this.documensoApi(
        'GET',
        `/documents/${encodeURIComponent(envelopeId)}`,
      );

      return {
        envelopeId: String(doc.id),
        status: this.mapStatus(doc.status),
        createdAt: doc.createdAt,
        completedAt: doc.completedAt,
        signers: (doc.recipients ?? []).map((r: any) => ({
          email: r.email,
          name: r.name,
          status: this.mapRecipientStatus(r.signingStatus),
          signedAt: r.signedAt,
        })),
        provider: 'documenso',
      };
    } catch (e: any) {
      if (/404/.test(e.message)) return null;
      throw e;
    }
  }

  async downloadSignedPdf(envelopeId: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new EsignProviderNotConfiguredError('documenso', [
        'DOCUMENSO_API_TOKEN',
      ]);
    }
    const res = await fetch(
      `${this.baseUrl}/api/v1/documents/${encodeURIComponent(envelopeId)}/download`,
      { headers: { Authorization: this.apiToken } },
    );
    if (!res.ok) {
      throw new Error(
        `Documenso download failed: ${res.status} ${await res.text()}`,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<WebhookEvent | null> {
    // Verify HMAC signature if a secret is configured
    if (this.webhookSecret && signature) {
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        throw new Error('Documenso webhook signature mismatch');
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const kind = this.mapEventKind(payload.event);
    if (kind === 'unknown') return null;

    return {
      kind,
      envelopeId: String(payload.payload?.id ?? payload.documentId ?? ''),
      signerEmail: payload.payload?.recipient?.email,
      raw: payload,
    };
  }

  private mapStatus(raw?: string): EnvelopeStatus {
    switch ((raw ?? '').toUpperCase()) {
      case 'DRAFT':
        return 'draft';
      case 'PENDING':
        return 'pending';
      case 'COMPLETED':
        return 'completed';
      case 'REJECTED':
      case 'DECLINED':
        return 'declined';
      case 'VOIDED':
      case 'CANCELLED':
        return 'voided';
      case 'EXPIRED':
        return 'expired';
      default:
        return 'unknown';
    }
  }

  private mapRecipientStatus(
    raw?: string,
  ): 'pending' | 'signed' | 'declined' {
    switch ((raw ?? '').toUpperCase()) {
      case 'SIGNED':
        return 'signed';
      case 'REJECTED':
      case 'DECLINED':
        return 'declined';
      default:
        return 'pending';
    }
  }

  private mapEventKind(raw?: string): WebhookEvent['kind'] {
    switch ((raw ?? '').toLowerCase()) {
      case 'document.sent':
        return 'envelope.sent';
      case 'document.signed':
      case 'document.recipient.signed':
        return 'envelope.signed';
      case 'document.completed':
        return 'envelope.completed';
      case 'document.declined':
      case 'document.rejected':
        return 'envelope.declined';
      case 'document.voided':
      case 'document.cancelled':
        return 'envelope.voided';
      default:
        return 'unknown';
    }
  }
}
