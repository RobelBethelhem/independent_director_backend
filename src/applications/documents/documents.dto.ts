import { IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { DocType } from '../../common/enums';
import { MAX_DOC_SIZE_BYTES } from './document.constants';

export class PresignDto {
  @IsEnum(DocType)
  docType!: DocType;

  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(160)
  mime!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DOC_SIZE_BYTES)
  size!: number;
}

export class RecordDocumentDto {
  @IsEnum(DocType)
  docType!: DocType;

  @IsString()
  @MaxLength(512)
  storageKey!: string;

  @IsString()
  @MaxLength(255)
  originalFilename!: string;

  @IsString()
  @MaxLength(160)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DOC_SIZE_BYTES)
  sizeBytes!: number;
}
