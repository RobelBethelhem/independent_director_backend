import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuditQueryDto } from './audit.dto';

/** Read-only audit trail. The dedicated Auditor role plus Admins may view it. */
@Roles(UserRole.Auditor, UserRole.Admin)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('logs')
  logs(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }

  @Get('stats')
  stats() {
    return this.audit.stats();
  }
}
