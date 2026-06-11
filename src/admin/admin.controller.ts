import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RecruitmentService } from '../recruitment/recruitment.service';
import {
  AdminListQueryDto,
  AdminSearchDto,
  CreateUserDto,
  SendMessageDto,
  UpdateStatusDto,
} from './admin.dto';

@Roles(UserRole.Admin)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly recruitment: RecruitmentService,
  ) {}

  @Get('applications')
  list(@Query() query: AdminListQueryDto) {
    return this.admin.list(query);
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('reviewers')
  reviewers() {
    return this.admin.listReviewers();
  }

  @Post('users')
  createUser(@CurrentUser('id') userId: string, @Body() dto: CreateUserDto) {
    return this.admin.createUser(userId, dto);
  }

  @Get('auditors')
  auditors() {
    return this.admin.listAuditors();
  }

  @Get('recommenders')
  recommenders() {
    return this.admin.listRecommenders();
  }

  @Get('board')
  board() {
    return this.admin.board();
  }

  @Get('reports')
  reports() {
    return this.admin.reports();
  }

  // Declared before `applications/:id` so the literal paths aren't captured by the UUID param.
  @Get('applications/search')
  search(@Query() q: AdminSearchDto) {
    return this.admin.search(q);
  }

  @Get('applications/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="zemen-applications.csv"')
  export(@Query() q: AdminSearchDto) {
    return this.admin.exportCsv(q);
  }

  @Get('cycle')
  async cycle() {
    const c = await this.recruitment.getOrCreateActiveCycle();
    return {
      id: c.id,
      title: c.title,
      submissionCloseAt: c.submissionCloseAt,
      reviewUnlocked: c.reviewUnlocked,
    };
  }

  @Get('applications/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }

  @Patch('applications/:id/status')
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.admin.updateStatus(userId, id, dto);
  }

  @Post('applications/:id/messages')
  message(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.admin.sendMessage(userId, id, dto);
  }

  @Get('applications/:id/documents/:docId/download')
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.admin.downloadUrl(id, docId);
  }

  @Get('applications/:id/documents/:docId/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.admin.previewUrl(id, docId);
  }

  @Post('cycle/:id/open-review')
  openReview(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.openReview(userId, id);
  }
}
