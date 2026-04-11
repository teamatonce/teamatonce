import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Sandbox module — pluggable code execution for assessments and
 * lesson exercises.
 *
 * Pick a provider via SANDBOX_PROVIDER in your .env. See
 * `docs/providers/sandbox.md` for the full comparison.
 */
@Module({
  imports: [AuthModule], // JwtAuthGuard on /execute
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}
