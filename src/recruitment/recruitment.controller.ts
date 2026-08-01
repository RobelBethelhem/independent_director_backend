import { Controller, Get } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  /**
   * Public application-window info for the landing page: when applications close
   * (admin-managed) and whether they're currently open — used to show the live
   * countdown. No sensitive data; safe to expose without authentication.
   */
  @Public()
  @Get('window')
  async window() {
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    return {
      opensAt: cycle.opensAt,
      submissionCloseAt: cycle.submissionCloseAt,
      acceptingApplications: this.recruitment.isAcceptingApplications(cycle),
    };
  }
}
