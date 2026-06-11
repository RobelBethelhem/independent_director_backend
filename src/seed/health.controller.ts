import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/** Liveness probe for the host (Render health check) — unauthenticated. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'zemen-director-portal-api' };
  }
}
