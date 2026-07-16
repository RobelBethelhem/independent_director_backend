import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

/** Liveness probe for the host (Render health check) — unauthenticated and
 *  exempt from rate limiting so frequent uptime pings never trip the throttler. */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'zemen-director-portal-api' };
  }
}
