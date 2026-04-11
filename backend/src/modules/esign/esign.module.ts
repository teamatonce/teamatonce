import { Module } from '@nestjs/common';
import { EsignService } from './esign.service';

/**
 * E-signature module — exposes the pluggable EsignService for
 * contract signing workflows.
 *
 * Pick a provider by setting ESIGN_PROVIDER in your .env. See
 * `docs/providers/esign.md` for the full list.
 *
 * No controller yet — the existing contract module calls this
 * service directly. A future `/esign/webhooks/:provider` endpoint
 * for receiving signer-completed callbacks can land in a follow-up.
 */
@Module({
  providers: [EsignService],
  exports: [EsignService],
})
export class EsignModule {}
