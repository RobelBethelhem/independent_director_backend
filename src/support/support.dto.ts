import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SupportMessageKind } from '../common/enums';

export const SUPPORT_MAX_TEXT = 4000;
export const SUPPORT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Client-generated, unguessable id identifying an anonymous visitor's thread. */
const ANON_ID = /^[A-Za-z0-9_-]{16,80}$/;

export class SendMessageDto {
  @IsEnum(SupportMessageKind) kind!: SupportMessageKind;
  @IsOptional() @IsString() @MaxLength(SUPPORT_MAX_TEXT) text?: string;
  @IsOptional() @IsString() @MaxLength(512) storageKey?: string;
  @IsOptional() @IsString() @MaxLength(160) mimeType?: string;
  @IsOptional() @IsString() @MaxLength(255) originalFilename?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3_600_000) durationMs?: number;
}

export class AnonSendMessageDto extends SendMessageDto {
  @IsString() @MinLength(16) @MaxLength(80) @Matches(ANON_ID) anonId!: string;
}

export class PresignAttachmentDto {
  @IsEnum(SupportMessageKind) kind!: SupportMessageKind;
  @IsString() @MaxLength(160) mime!: string;
  @IsInt() @Min(1) @Max(SUPPORT_MAX_ATTACHMENT_BYTES) size!: number;
}

export class AnonPresignDto extends PresignAttachmentDto {
  @IsString() @MinLength(16) @MaxLength(80) @Matches(ANON_ID) anonId!: string;
}

export class AnonIdDto {
  @IsString() @MinLength(16) @MaxLength(80) @Matches(ANON_ID) anonId!: string;
}

export class AnonAttachmentDto {
  @IsString() @MinLength(16) @MaxLength(80) @Matches(ANON_ID) anonId!: string;
  @IsUUID() messageId!: string;
}
