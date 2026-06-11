import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Persists which wizard step the applicant is on (and the furthest reached). */
export class UpdateProgressDto {
  @IsInt() @Min(0) @Max(7)
  currentStep!: number;

  @IsInt() @Min(0) @Max(7)
  maxStepSeen!: number;
}

/**
 * Partial autosave of step-1 personal/contact fields + the conflicts free text.
 * All fields optional — a draft is valid in any incomplete state; completeness
 * is only enforced at submit time.
 */
export class UpdateApplicationDto {
  @IsOptional() @IsString() @MaxLength(20)
  title?: string;

  @IsOptional() @IsString() @MaxLength(120)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  middleName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  lastName?: string;

  /** ISO date string (YYYY-MM-DD). */
  @IsOptional() @IsString()
  dob?: string;

  @IsOptional() @IsString() @MaxLength(40)
  gender?: string;

  @IsOptional() @IsString() @MaxLength(80)
  nationality?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(80)
  country?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  conflictsText?: string;
}
