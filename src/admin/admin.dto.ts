import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApplicationStatus, MessageChannel, MessageTemplate, UserRole } from '../common/enums';
import { PHONE_PATTERN, PHONE_MESSAGE } from '../common/phone';

export class CreateUserDto {
  @IsString() @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @IsIn([UserRole.Reviewer, UserRole.Admin, UserRole.Auditor, UserRole.Recommender, UserRole.Support])
  role!: UserRole.Reviewer | UserRole.Admin | UserRole.Auditor | UserRole.Recommender | UserRole.Support;
}

export class AdminListQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  query?: string;

  @IsOptional() @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional() @IsIn(['submitted', 'score', 'name'])
  sort?: 'submitted' | 'score' | 'name';

  @IsOptional() @IsInt() @Min(1) @Max(100_000)
  page?: number;
}

export class AdminSearchDto {
  @IsOptional() @IsString() @MaxLength(120) query?: string;
  /** Comma-separated statuses (any-of). */
  @IsOptional() @IsString() @MaxLength(200) status?: string;
  @IsOptional() @IsInt() @Min(0) scoreMin?: number;
  @IsOptional() @IsInt() @Min(0) scoreMax?: number;
  @IsOptional() @IsInt() @Min(0) yearsMin?: number;
  @IsOptional() @IsInt() @Min(0) yearsMax?: number;
  /** Minimum degree level: 1 Diploma · 2 Bachelor's · 3 Master's · 4 Doctorate. */
  @IsOptional() @IsInt() @Min(0) degreeMin?: number;
  /** Comma-separated expertise areas (any-of). */
  @IsOptional() @IsString() @MaxLength(400) expertise?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(40) gender?: string;
  @IsOptional() @IsIn(['yes', 'no']) flagged?: 'yes' | 'no';
  @IsOptional() @IsIn(['fully', 'partial', 'unreviewed']) reviewState?: 'fully' | 'partial' | 'unreviewed';
  @IsOptional() @IsIn(['yes']) shortlist?: 'yes';
  @IsOptional() @IsString() @MaxLength(40) submittedFrom?: string;
  @IsOptional() @IsString() @MaxLength(40) submittedTo?: string;
  @IsOptional() @IsIn(['submitted', 'score', 'name', 'years', 'flags']) sort?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) page?: number;
}

export class UpdateStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;
}

export class UpdateCycleSettingsDto {
  @IsOptional() @IsDateString()
  submissionCloseAt?: string;

  // Mandatory once set — can be moved to a later date (extend the review
  // period) but not cleared back to "no deadline". Omit to leave unchanged.
  @IsOptional() @IsDateString()
  reviewCloseAt?: string;
}

export class SendMessageDto {
  @IsEnum(MessageChannel)
  channel!: MessageChannel;

  @IsEnum(MessageTemplate)
  template!: MessageTemplate;

  @IsOptional() @IsString() @MaxLength(200)
  subject?: string;

  @IsString() @MaxLength(5000)
  body!: string;
}
