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

  @IsOptional() @IsBoolean()
  submitted?: boolean;
}
