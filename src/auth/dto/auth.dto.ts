import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { PHONE_PATTERN, PHONE_MESSAGE } from '../../common/phone';

/** Password complexity: at least one lowercase, one uppercase, one number and
 *  one special character (min length enforced separately). Blocks weak/guessable
 *  secrets like "123456789" or "password". Enforced only when SETTING a password
 *  (register / reset / change), so existing accounts keep working. */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const PASSWORD_MESSAGE =
  'Password must include uppercase and lowercase letters, a number, and a special character';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Required' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
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
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Required' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
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
