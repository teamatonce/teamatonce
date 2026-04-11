import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExecuteDto } from './dto/execute.dto';

/**
 * Sandbox endpoints.
 *
 *   GET  /api/v1/sandbox/config                   — frontend bootstrap (public)
 *   GET  /api/v1/sandbox/languages                — list supported languages
 *   POST /api/v1/sandbox/execute  (auth required) — run code server-side
 *
 * `execute` is JWT-protected because it costs real compute and
 * would be abused by unauthenticated callers. For public lesson
 * previews that use sandpack (browser-only execution), the
 * frontend renders a <Sandpack> component directly and never
 * calls this endpoint.
 */
@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandbox: SandboxService) {}

  @Get('config')
  @ApiOperation({ summary: 'Frontend sandbox bootstrap config' })
  getConfig() {
    return this.sandbox.getFrontendConfig();
  }

  @Get('languages')
  @ApiOperation({ summary: 'List languages supported by the active provider' })
  async listLanguages() {
    return {
      provider: this.sandbox.getProviderName(),
      languages: await this.sandbox.listLanguages(),
    };
  }

  @Post('execute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute code server-side (judge0 / piston)',
    description:
      'Sandpack-style providers throw NotSupported here because they run in the browser.',
  })
  async execute(@Body() input: ExecuteDto) {
    // Input shape + upper-bound validation is handled by the global
    // ValidationPipe via class-validator decorators on ExecuteDto.
    // That enforces:
    //   - language / source are non-empty strings
    //   - source ≤ 64KB
    //   - stdin ≤ 32KB
    //   - timeLimitSeconds ∈ [1, 15]
    //   - memoryLimitKb ∈ [16MB, 500MB]
    //   - commandLineArgs ≤ 32 entries × 256 chars
    return this.sandbox.execute(input);
  }
}
