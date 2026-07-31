import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SupportThread } from './entities/support-thread.entity';
import { SupportMessage } from './entities/support-message.entity';
import { StorageService } from '../storage/storage.service';
import { SupportMessageKind, SupportSender } from '../common/enums';
import { PresignAttachmentDto, SendMessageDto, SUPPORT_MAX_ATTACHMENT_BYTES, SUPPORT_MAX_TEXT } from './support.dto';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AUDIO_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'];
const EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3',
  'audio/wav': '.wav', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac',
};

export interface MessageOut {
  id: string;
  sender: SupportSender;
  kind: SupportMessageKind;
  text: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  durationMs: number | null;
  createdAt: string;
}

/** Bidirectional support chat: applicants/anonymous visitors ↔ support agents. */
@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportThread) private readonly threads: Repository<SupportThread>,
    @InjectRepository(SupportMessage) private readonly messages: Repository<SupportMessage>,
    private readonly storage: StorageService,
  ) {}

  // ---------------- Applicant / anonymous side ----------------

  async getMineByUser(userId: string): Promise<{ thread: object | null; messages: MessageOut[] }> {
    const thread = await this.threads.findOne({ where: { userId } });
    return this.threadPayload(thread);
  }

  async getMineByAnon(anonId: string): Promise<{ thread: object | null; messages: MessageOut[] }> {
    const thread = await this.threads.findOne({ where: { anonId } });
    return this.threadPayload(thread);
  }

  async sendByUser(userId: string, displayName: string, dto: SendMessageDto): Promise<MessageOut> {
    const thread = await this.ensureUserThread(userId, displayName);
    return this.appendMessage(thread, SupportSender.User, userId, dto);
  }

  async sendByAnon(anonId: string, displayName: string, dto: SendMessageDto): Promise<MessageOut> {
    const thread = await this.ensureAnonThread(anonId, displayName);
    return this.appendMessage(thread, SupportSender.User, null, dto);
  }

  async presignByUser(userId: string, displayName: string, dto: PresignAttachmentDto) {
    const thread = await this.ensureUserThread(userId, displayName);
    return this.presign(thread, dto);
  }

  async presignByAnon(anonId: string, displayName: string, dto: PresignAttachmentDto) {
    const thread = await this.ensureAnonThread(anonId, displayName);
    return this.presign(thread, dto);
  }

  async attachmentUrlForUser(userId: string, messageId: string) {
    const { msg } = await this.loadAttachment(messageId);
    const thread = await this.threads.findOne({ where: { id: msg.threadId } });
    if (!thread || thread.userId !== userId) throw new ForbiddenException('Not your conversation');
    return this.signAttachment(msg);
  }

  async attachmentUrlForAnon(anonId: string, messageId: string) {
    const { msg } = await this.loadAttachment(messageId);
    const thread = await this.threads.findOne({ where: { id: msg.threadId } });
    if (!thread || thread.anonId !== anonId) throw new ForbiddenException('Not your conversation');
    return this.signAttachment(msg);
  }

  // ---------------- Support-agent side ----------------

  async listThreads(): Promise<object[]> {
    const rows = await this.threads.find({ order: { lastMessageAt: 'DESC' }, take: 300 });
    return rows.map((t) => ({
      id: t.id,
      displayName: t.displayName ?? (t.userId ? 'Applicant' : 'Guest'),
      isGuest: !t.userId,
      closed: t.closed,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessageBy: t.lastMessageBy,
      preview: t.lastMessagePreview,
      needsReply: t.lastMessageBy === SupportSender.User && !t.closed,
    }));
  }

  async getThreadForSupport(threadId: string): Promise<{ thread: object; messages: MessageOut[] }> {
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return { thread: this.threadOut(thread), messages: await this.loadMessages(thread.id) };
  }

  async sendBySupport(agentId: string, threadId: string, dto: SendMessageDto): Promise<MessageOut> {
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return this.appendMessage(thread, SupportSender.Support, agentId, dto);
  }

  async presignForSupport(threadId: string, dto: PresignAttachmentDto) {
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return this.presign(thread, dto);
  }

  async attachmentUrlForSupport(messageId: string) {
    const { msg } = await this.loadAttachment(messageId);
    return this.signAttachment(msg);
  }

  async setClosed(threadId: string, closed: boolean) {
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    thread.closed = closed;
    await this.threads.save(thread);
    return { ok: true as const };
  }

  // ---------------- internals ----------------

  private async ensureUserThread(userId: string, displayName: string): Promise<SupportThread> {
    let thread = await this.threads.findOne({ where: { userId } });
    if (!thread) {
      thread = await this.threads.save(this.threads.create({ userId, anonId: null, displayName }));
    }
    return thread;
  }

  private async ensureAnonThread(anonId: string, displayName: string): Promise<SupportThread> {
    let thread = await this.threads.findOne({ where: { anonId } });
    if (!thread) {
      thread = await this.threads.save(this.threads.create({ userId: null, anonId, displayName }));
    }
    return thread;
  }

  private async appendMessage(
    thread: SupportThread,
    sender: SupportSender,
    senderUserId: string | null,
    dto: SendMessageDto,
  ): Promise<MessageOut> {
    let text: string | null = null;
    let storageKey: string | null = null;
    let mimeType: string | null = null;
    let originalFilename: string | null = null;
    let durationMs: number | null = null;

    if (dto.kind === SupportMessageKind.Text) {
      text = (dto.text ?? '').trim();
      if (!text) throw new BadRequestException('Message text is required.');
      text = text.slice(0, SUPPORT_MAX_TEXT);
    } else {
      if (!dto.storageKey || !dto.mimeType) throw new BadRequestException('Attachment is missing.');
      if (!dto.storageKey.startsWith(`support/${thread.id}/`)) {
        throw new BadRequestException('Attachment does not belong to this conversation.');
      }
      let head: { size: number; contentType?: string };
      try {
        head = await this.storage.headObject(dto.storageKey);
      } catch {
        throw new BadRequestException('Attachment could not be verified — please try again.');
      }
      if (head.size > SUPPORT_MAX_ATTACHMENT_BYTES) {
        await this.storage.delete(dto.storageKey).catch(() => undefined);
        throw new BadRequestException('File exceeds the 10 MB limit.');
      }
      const allowed = dto.kind === SupportMessageKind.Image ? IMAGE_MIMES : AUDIO_MIMES;
      if (head.contentType && !allowed.includes(head.contentType)) {
        await this.storage.delete(dto.storageKey).catch(() => undefined);
        throw new BadRequestException('Unsupported attachment type.');
      }
      storageKey = dto.storageKey;
      mimeType = dto.mimeType;
      originalFilename = dto.originalFilename ? dto.originalFilename.replace(/[\r\n"\\<>]+/g, '_').slice(0, 200) : null;
      durationMs = dto.durationMs ?? null;
      text = dto.text ? dto.text.trim().slice(0, SUPPORT_MAX_TEXT) : null;
    }

    const saved = await this.messages.save(
      this.messages.create({ threadId: thread.id, sender, senderUserId, kind: dto.kind, text, storageKey, mimeType, originalFilename, durationMs }),
    );
    thread.lastMessageAt = saved.createdAt;
    thread.lastMessageBy = sender;
    thread.lastMessagePreview =
      dto.kind === SupportMessageKind.Text
        ? (text ?? '').slice(0, 120)
        : dto.kind === SupportMessageKind.Image
          ? '📷 Photo'
          : '🎤 Voice message';
    if (sender === SupportSender.Support) thread.closed = false;
    await this.threads.save(thread);
    return this.messageOut(saved);
  }

  private async presign(thread: SupportThread, dto: PresignAttachmentDto): Promise<{ storageKey: string; uploadUrl: string }> {
    if (dto.kind !== SupportMessageKind.Image && dto.kind !== SupportMessageKind.Voice) {
      throw new BadRequestException('Only an image or a voice note can be attached.');
    }
    const allowed = dto.kind === SupportMessageKind.Image ? IMAGE_MIMES : AUDIO_MIMES;
    if (!allowed.includes(dto.mime)) throw new BadRequestException('Unsupported file type.');
    if (dto.size > SUPPORT_MAX_ATTACHMENT_BYTES) throw new BadRequestException('File exceeds the 10 MB limit.');
    const storageKey = `support/${thread.id}/${randomUUID()}${EXT[dto.mime] ?? ''}`;
    const uploadUrl = await this.storage.presignUpload(storageKey, dto.mime);
    return { storageKey, uploadUrl };
  }

  private async loadAttachment(messageId: string): Promise<{ msg: SupportMessage }> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg || !msg.storageKey) throw new NotFoundException('Attachment not found');
    return { msg };
  }

  private async signAttachment(msg: SupportMessage): Promise<{ url: string; mimeType: string | null }> {
    const url = await this.storage.presignDownload(msg.storageKey!, msg.originalFilename ?? undefined, 300, true);
    return { url, mimeType: msg.mimeType };
  }

  private async threadPayload(thread: SupportThread | null): Promise<{ thread: object | null; messages: MessageOut[] }> {
    if (!thread) return { thread: null, messages: [] };
    return { thread: this.threadOut(thread), messages: await this.loadMessages(thread.id) };
  }

  private async loadMessages(threadId: string): Promise<MessageOut[]> {
    const rows = await this.messages.find({ where: { threadId }, order: { createdAt: 'ASC' }, take: 500 });
    return rows.map((m) => this.messageOut(m));
  }

  private threadOut(t: SupportThread): object {
    return {
      id: t.id,
      displayName: t.displayName ?? (t.userId ? 'Applicant' : 'Guest'),
      closed: t.closed,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessageBy: t.lastMessageBy,
    };
  }

  private messageOut(m: SupportMessage): MessageOut {
    return {
      id: m.id,
      sender: m.sender,
      kind: m.kind,
      text: m.text,
      mimeType: m.mimeType,
      originalFilename: m.originalFilename,
      durationMs: m.durationMs,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
