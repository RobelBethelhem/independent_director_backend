import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CriterionId } from '../common/enums';

class ScoreItem {
  @IsEnum(CriterionId) criterionId!: CriterionId;
  @IsInt() @Min(1) @Max(10) value!: number;
}

export class PutScoresDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScoreItem)
  scores!: ScoreItem[];
}

export class PutReviewDto {
  @IsOptional() @IsString() @MaxLength(4000)
  comment?: string;

  @IsOptional() @IsBoolean()
  shortlistRecommended?: boolean;

  /** FINAL submission (document + interview) — only once interview scoring opens. */
  @IsOptional() @IsBoolean()
  submitted?: boolean;

  /** Stage 1 — submit the Document Evaluation (50%) on its own. */
  @IsOptional() @IsBoolean()
  submitDocument?: boolean;
}
