import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SecurityService } from './security.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { ReportTamperDto } from './security.dto';

@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  /**
   * The SPA reports inspection / dev-tools attempts here. Public (fires around
   * the login screen) and tightly throttled. Always returns a bland { ok:true }
   * — the client never learns its strike count or whether it's now blocked.
   * The service records the strike against the request's trusted IP.
   */
  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('report-tamper')
  async report(@Body() dto: ReportTamperDto): Promise<{ ok: true }> {
    await this.security.recordTamperStrike(dto.kind ?? 'unknown').catch(() => undefined);
    return { ok: true };
  }
}
