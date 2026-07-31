import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SupportService } from './support.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import {
  AnonAttachmentDto,
  AnonIdDto,
  AnonPresignDto,
  AnonSendMessageDto,
  PresignAttachmentDto,
  SendMessageDto,
} from './support.dto';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ---------------- Signed-in applicant ----------------
  @Get('me')
  getMine(@CurrentUser('id') userId: string) {
    return this.support.getMineByUser(userId);
  }

  @Post('me/messages')
  sendMine(@CurrentUser('id') userId: string, @CurrentUser('email') email: string, @Body() dto: SendMessageDto) {
    return this.support.sendByUser(userId, email, dto);
  }

  @Post('me/attachments/presign')
  presignMine(@CurrentUser('id') userId: string, @CurrentUser('email') email: string, @Body() dto: PresignAttachmentDto) {
    return this.support.presignByUser(userId, email, dto);
  }

  @Get('me/attachments/:messageId')
  attachMine(@CurrentUser('id') userId: string, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.support.attachmentUrlForUser(userId, messageId);
  }

  // ---------------- Anonymous visitor (identified by an unguessable browser id) ----------------
  @Public()
  @Post('anon')
  getAnon(@Body() dto: AnonIdDto) {
    return this.support.getMineByAnon(dto.anonId);
  }

  @Public()
  @Post('anon/messages')
  sendAnon(@Body() dto: AnonSendMessageDto) {
    return this.support.sendByAnon(dto.anonId, 'Guest', dto);
  }

  @Public()
  @Post('anon/attachments/presign')
  presignAnon(@Body() dto: AnonPresignDto) {
    return this.support.presignByAnon(dto.anonId, 'Guest', dto);
  }

  @Public()
  @Post('anon/attachments/url')
  attachAnon(@Body() dto: AnonAttachmentDto) {
    return this.support.attachmentUrlForAnon(dto.anonId, dto.messageId);
  }

  // ---------------- Support agent (support role, or admin) ----------------
  @Roles(UserRole.Support, UserRole.Admin)
  @Get('threads')
  list() {
    return this.support.listThreads();
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Get('threads/:id')
  thread(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.getThreadForSupport(id);
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Post('threads/:id/messages')
  reply(@CurrentUser('id') agentId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.support.sendBySupport(agentId, id, dto);
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Post('threads/:id/attachments/presign')
  presignSupport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PresignAttachmentDto) {
    return this.support.presignForSupport(id, dto);
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Get('threads/:id/attachments/:messageId')
  attachSupport(@Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.support.attachmentUrlForSupport(messageId);
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Post('threads/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.setClosed(id, true);
  }

  @Roles(UserRole.Support, UserRole.Admin)
  @Post('threads/:id/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.setClosed(id, false);
  }
}
