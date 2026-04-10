import { Controller, Get } from '@nestjs/common';
import { ProvidersHealthService, ProviderHealth } from './providers-health.service';

/**
 * Health endpoints.
 *
 * - `GET /health` — simple liveness (always 200).
 * - `GET /health/providers` — per-provider status table used by the
 *   setup wizard's "test connection" step and the admin Integrations page.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly providersHealth: ProvidersHealthService) {}

  @Get()
  root() {
    return {
      status: 'ok',
      service: 'teamatonce-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('providers')
  providers(): {
    generatedAt: string;
    summary: { ready: number; skipped: number; error: number; planned: number };
    providers: ProviderHealth[];
  } {
    const rows = this.providersHealth.getAll();
    const summary = rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      },
      { ready: 0, skipped: 0, error: 0, planned: 0 } as Record<string, number>,
    );
    return {
      generatedAt: new Date().toISOString(),
      summary: summary as { ready: number; skipped: number; error: number; planned: number },
      providers: rows,
    };
  }
}
