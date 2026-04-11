import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Email module — exposes the pluggable EmailService for all transactional
 * email needs (auth verification, order confirmations, shipping updates,
 * etc.).
 *
 * Pick a provider by setting EMAIL_PROVIDER in your .env. See
 * `docs/providers/email.md` for the full list.
 *
 * This module deliberately has no controllers — email is an outbound
 * concern. A future `/admin/email/test` endpoint can land in a follow-up
 * when the admin Integrations page needs it.
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
