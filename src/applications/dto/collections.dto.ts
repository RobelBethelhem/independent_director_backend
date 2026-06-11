import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  DeclarationAnswer,
  DeclarationItemId,
  EXPERTISE_OPTIONS,
} from '../../common/enums';

/**
 * The repeatable collections are saved with PUT semantics: the client sends the
 * full desired list and the server replaces the existing rows. Each `items`
 * wrapper keeps room to add collection-level metadata later.
 */

class EducationItem {
  @IsOptional() @IsString() @MaxLength(120) degree?: string;
  @IsOptional() @IsString() @MaxLength(120) field?: string;
  @IsOptional() @IsString() @MaxLength(160) institution?: string;
  @IsOptional() @IsString() @MaxLength(10) year?: string;
}
export class PutEducationDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EducationItem)
  items!: EducationItem[];
}

class ProfessionalItem {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(160) body?: string;
  @IsOptional() @IsString() @MaxLength(10) year?: string;
}
export class PutProfessionalDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProfessionalItem)
  items!: ProfessionalItem[];
}

class EmploymentItem {
  @IsOptional() @IsString() @MaxLength(160) org?: string;
  @IsOptional() @IsString() @MaxLength(160) role?: string;
  @IsOptional() @IsString() @MaxLength(20) fromMonth?: string;
  @IsOptional() @IsString() @MaxLength(20) toMonth?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;
}
export class PutEmploymentDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EmploymentItem)
  items!: EmploymentItem[];
}

class BoardItem {
  @IsOptional() @IsString() @MaxLength(160) org?: string;
  @IsOptional() @IsString() @MaxLength(120) position?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
  @IsOptional() @IsString() @MaxLength(60) period?: string;
}
export class PutBoardsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BoardItem)
  items!: BoardItem[];
}

export class PutExpertiseDto {
  @IsArray()
  @IsIn(EXPERTISE_OPTIONS as unknown as string[], { each: true })
  values!: string[];
}

class ReferenceItem {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) positionOrg?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) relationship?: string;
}
export class PutReferencesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReferenceItem)
  items!: ReferenceItem[];
}

class DeclarationItem {
  @IsEnum(DeclarationItemId) itemId!: DeclarationItemId;
  @IsEnum(DeclarationAnswer) answer!: DeclarationAnswer;
  @IsOptional() @IsString() @MaxLength(2000) explanation?: string;
}
export class PutDeclarationsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeclarationItem)
  items!: DeclarationItem[];
}

export class CertifyDto {
  @IsBoolean() certified!: boolean;
}
