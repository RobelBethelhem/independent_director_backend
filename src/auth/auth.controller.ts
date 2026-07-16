import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { UserRole } from '../common/enums';

/** Per-IP rate limits on unauthenticated auth endpoints — defense against
 *  credential stuffing and OTP/2FA/reset-code brute force. 20/min is tolerant
 *  of many legitimate staff sharing one office/NAT IP while still capping
 *  automated guessing (the OTP's 5-attempts-per-code + 6-digit length is the
 *  primary code-guessing defense; this is the outer layer). */
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
/** Tighter for code-ISSUING endpoints, to blunt OTP spraying and the
 *  re-issue-to-reset-attempts amplification (a fresh code resets maxAttempts). */
const CODE_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
import {
  ChangePasswordDto,
  ConfirmSessionDto,
  ConfirmTotpSetupDto,
  DisableTotpDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  Verify2FALoginDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle(CODE_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @Throttle(CODE_THROTTLE)
  @HttpCode(200)
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto.email);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('2fa/verify-login')
  verifyTotpLogin(@Body() dto: Verify2FALoginDto) {
    return this.auth.verifyTotpLogin(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login/confirm-session')
  confirmSessionAndLogin(@Body() dto: ConfirmSessionDto) {
    return this.auth.confirmSessionAndLogin(dto);
  }

  @Public()
  @Throttle(CODE_THROTTLE)
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logout(@CurrentUser('id') userId: string, @Body() _dto: LogoutDto) {
    return this.auth.logout(userId);
  }

  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @HttpCode(200)
  @Post('2fa/setup')
  setupTotp(@CurrentUser('id') userId: string) {
    return this.auth.setupTotp(userId);
  }

  @HttpCode(200)
  @Post('2fa/confirm')
  confirmTotpSetup(@CurrentUser('id') userId: string, @Body() dto: ConfirmTotpSetupDto) {
    return this.auth.confirmTotpSetup(userId, dto.code);
  }

  @HttpCode(200)
  @Post('2fa/disable')
  disableTotp(@CurrentUser('id') userId: string, @Body() dto: DisableTotpDto) {
    return this.auth.disableTotp(userId, dto.password, dto.code);
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.users.getByIdOrThrow(current.id);
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.totpEnabled,
      twoFactorAvailable: user.role !== UserRole.Applicant,
    };
  }
}
