/**
 * Common interface that every e-signature provider implements.
 *
 * Pick a provider by setting ESIGN_PROVIDER in your .env to one of:
 *
 *   documenso      - Documenso (https://documenso.com). Open-source
 *                    DocuSign alternative. Self-hostable or managed.
 *                    The default and recommended starting point.
 *
 *   opensign       - OpenSign (https://opensignlabs.com). Another
 *                    open-source e-signature option.
 *
 *   docuseal       - DocuSeal (https://docuseal.com). Open-source,
 *                    signer-friendly UX. [PLANNED follow-up]
 *
 *   dropbox-sign   - Dropbox Sign / HelloSign (https://dropbox.com/sign).
 *                    Polished managed option. [PLANNED follow-up]
 *
 *   docusign       - DocuSign (https://docusign.com). Enterprise
 *                    standard. Complex OAuth/JWT setup.
 *                    [PLANNED follow-up]
 *
 *   none           - E-sign disabled. Every method throws.
 *                    The default if ESIGN_PROVIDER is unset.
 *
 * Adding a new provider: implement this interface, register it in
 * providers/index.ts, document the env vars in docs/providers/esign.md.
 */

export interface EsignSigner {
  /** Display name shown in the signing UI. */
  name: string;
  /** Email address to send the signing invite to. */
  email: string;
  /** Optional role label ("client", "contractor", "witness"). */
  role?: string;
  /** Signing order — 1 signs first, 2 signs next, etc. Defaults to
   * 1 for simple parallel signing. */
  signingOrder?: number;
}

export interface EsignField {
  /** Which signer this field is for (matches EsignSigner.email). */
  signerEmail: string;
  /** Field kind. */
  type: 'signature' | 'initial' | 'date' | 'text' | 'checkbox';
  /** 1-indexed page number the field is placed on. */
  page: number;
  /** Position on the page (0..1 relative coordinates). */
  x: number;
  y: number;
  /** Width / height (0..1 relative). */
  width: number;
  height: number;
  /** Optional pre-fill value for text fields. */
  defaultValue?: string;
  /** Whether the field is required. Default true. */
  required?: boolean;
}

export interface CreateEnvelopeInput {
  /** Human-readable document title shown in emails. */
  title: string;
  /** Optional cover message included in the signing invite email. */
  message?: string;
  /** The PDF to sign. Providers that take a URL can accept either. */
  documentPdf: Buffer;
  /** Original filename for display purposes. */
  filename?: string;
  /** One or more signers. Order matters if signingOrder is set. */
  signers: EsignSigner[];
  /** Optional fields to pre-place on the document. Providers that
   * don't support placement will use "tag-based" fallbacks or
   * self-serve placement in the signing UI. */
  fields?: EsignField[];
  /** Internal reference — stored by the provider for webhook
   * correlation. */
  externalReference?: string;
}

export interface Envelope {
  /** Provider-specific envelope / document id. */
  envelopeId: string;
  /** Direct URL the first signer can open (if the provider exposes
   * one; otherwise undefined — signers get an email link). */
  signingUrlFirstSigner?: string;
  /** Provider name. */
  provider: string;
  /** Current status at creation time. */
  status: EnvelopeStatus;
}

export type EnvelopeStatus =
  | 'draft'
  | 'pending' // sent but no one has signed
  | 'partially_signed' // at least one signer has signed, others haven't
  | 'completed' // all signers signed
  | 'declined' // a signer declined
  | 'voided' // sender voided
  | 'expired'
  | 'unknown';

export interface EnvelopeInfo {
  envelopeId: string;
  status: EnvelopeStatus;
  createdAt?: string;
  completedAt?: string;
  /** Per-signer status. */
  signers: Array<{
    email: string;
    name: string;
    status: 'pending' | 'signed' | 'declined';
    signedAt?: string;
  }>;
  provider: string;
}

export interface WebhookEvent {
  /** Normalized event kind. Providers map their native events to
   * one of these. */
  kind: 'envelope.sent' | 'envelope.signed' | 'envelope.completed' | 'envelope.declined' | 'envelope.voided' | 'unknown';
  /** Provider-specific envelope id. */
  envelopeId: string;
  /** Arbitrary extra data the provider sent — stored for audit. */
  raw: any;
  /** Signer email if this event is signer-specific. */
  signerEmail?: string;
}

/**
 * Common interface implemented by every e-sign provider. Methods a
 * provider can't support should throw EsignProviderNotSupportedError
 * — never silently no-op.
 */
export interface EsignProvider {
  /** Stable provider name for logging / clients. */
  readonly name:
    | 'documenso'
    | 'opensign'
    | 'docuseal'
    | 'dropbox-sign'
    | 'docusign'
    | 'none';

  /** True if the provider has the credentials it needs. */
  isAvailable(): boolean;

  /**
   * Create a new signing envelope with the provided PDF + signers.
   * Most providers kick off email delivery as part of this call.
   */
  createEnvelope(input: CreateEnvelopeInput): Promise<Envelope>;

  /**
   * Look up the current status of a previously-created envelope.
   */
  getEnvelope(envelopeId: string): Promise<EnvelopeInfo | null>;

  /**
   * Download the signed PDF. Providers may refuse this until
   * status === 'completed'.
   */
  downloadSignedPdf(envelopeId: string): Promise<Buffer>;

  /**
   * Parse a webhook payload (usually after verifying its signature)
   * and return the normalized event shape. Returns null if the
   * payload isn't a recognized event kind.
   */
  parseWebhook(rawBody: string, signature?: string): Promise<WebhookEvent | null>;
}

/**
 * Thrown when a provider is asked to do something it can't support.
 */
export class EsignProviderNotSupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `Operation "${operation}" is not supported by the "${provider}" esign provider. See docs/providers/esign.md.`,
    );
    this.name = 'EsignProviderNotSupportedError';
  }
}

/**
 * Thrown when a provider is selected but its credentials are missing.
 */
export class EsignProviderNotConfiguredError extends Error {
  constructor(provider: string, missingVars: string[]) {
    super(
      `Esign provider "${provider}" is selected but the following env vars are missing: ${missingVars.join(', ')}. See docs/providers/esign.md.`,
    );
    this.name = 'EsignProviderNotConfiguredError';
  }
}
