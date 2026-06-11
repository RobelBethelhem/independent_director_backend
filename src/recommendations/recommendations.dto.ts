import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRecommendationDto {
  @IsString() @MinLength(2) @MaxLength(120)
  candidateName!: string;

  @IsEmail({}, { message: 'Enter a valid email' })
  candidateEmail!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  message?: string;
}
