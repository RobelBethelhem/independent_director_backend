import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { PresignDto, RecordDocumentDto } from './documents.dto';

@Roles(UserRole.Applicant)
@Controller('applications/:id/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.list(userId, id);
  }

  @Post('presign')
  @HttpCode(200)
  presign(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PresignDto,
  ) {
    return this.documents.presign(userId, id, dto);
  }

  @Post()
  record(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDocumentDto,
  ) {
    return this.documents.record(userId, id, dto);
  }

  @Delete(':docId')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.documents.remove(userId, id, docId);
  }

  @Get(':docId/download')
  download(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.documents.downloadUrl(userId, id, docId);
  }

  @Get(':docId/preview')
  preview(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.documents.previewUrl(userId, id, docId);
  }
}
