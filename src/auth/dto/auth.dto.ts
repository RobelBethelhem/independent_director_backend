import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Required' })
  phone!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  /** Optional referral token when registering from a recommendation link. */
  @IsOptional()
  @IsString()
  recommendationToken?: string;
}

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'Code must be digits' })
  @Length(4, 8)
  code!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Required' })
  password!: string;
}

export class ResendOtpDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'Code must be digits' })
  @Length(4, 8)
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Required' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

// ---- Multi-step login (2FA / single-session confirm) ----

export class Verify2FALoginDto {
  @IsString() @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}

export class ConfirmSessionDto {
  @IsString() @IsNotEmpty()
  challengeToken!: string;
}

// ---- 2FA setup (authenticated) ----

export class ConfirmTotpSetupDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}

export class DisableTotpDto {
  @IsString() @IsNotEmpty()
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}
