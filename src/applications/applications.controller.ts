import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { UpdateApplicationDto, UpdateProgressDto } from './dto/update-application.dto';
import {
  CertifyDto,
  PutBoardsDto,
  PutDeclarationsDto,
  PutEducationDto,
  PutEmploymentDto,
  PutExpertiseDto,
  PutProfessionalDto,
  PutReferencesDto,
} from './dto/collections.dto';

// Draft edits autosave continuously — too noisy for the audit trail. The one
// discrete applicant action, submit(), writes its own rich audit record.
@SkipAudit()
@Roles(UserRole.Applicant)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('mine')
  getMine(@CurrentUser('id') userId: string) {
    return this.applications.getMine(userId);
  }

  @Post()
  createDraft(@CurrentUser('id') userId: string) {
    return this.applications.createDraft(userId);
  }

  @Patch(':id')
  patch(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applications.patch(userId, id, dto);
  }

  @Patch(':id/progress')
  saveProgress(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.applications.saveProgress(userId, id, dto);
  }

  @Put(':id/education')
  education(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutEducationDto,
  ) {
    return this.applications.replaceEducation(userId, id, dto);
  }

  @Put(':id/professional')
  professional(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutProfessionalDto,
  ) {
    return this.applications.replaceProfessional(userId, id, dto);
  }

  @Put(':id/employment')
  employment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutEmploymentDto,
  ) {
    return this.applications.replaceEmployment(userId, id, dto);
  }

  @Put(':id/boards')
  boards(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutBoardsDto,
  ) {
    return this.applications.replaceBoards(userId, id, dto);
  }

  @Put(':id/expertise')
  expertise(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutExpertiseDto,
  ) {
    return this.applications.replaceExpertise(userId, id, dto);
  }

  @Put(':id/references')
  references(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutReferencesDto,
  ) {
    return this.applications.replaceReferences(userId, id, dto);
  }

  @Put(':id/declarations')
  declarations(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutDeclarationsDto,
  ) {
    return this.applications.replaceDeclarations(userId, id, dto);
  }

  @Put(':id/certify')
  certify(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CertifyDto,
  ) {
    return this.applications.certify(userId, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.submit(userId, id);
  }

  @Get(':id/status')
  status(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.getStatus(userId, id);
  }
}
