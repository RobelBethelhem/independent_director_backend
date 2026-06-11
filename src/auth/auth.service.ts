import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { User } from '../users/user.entity';
import { Otp } from './otp.entity';
import { OtpChannel, OtpPurpose, UserStatus } from '../common/enums';
import { AccessTokenPayload } from './strategies/jwt.strategy';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/auth.dto';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; emailVerified: boolean; mustChangePassword: boolean };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly recommendations: RecommendationsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(Otp)
    private readonly otps: Repository<Otp>,
  ) {}

  // ---- Registration & verification ----

  async register(dto: RegisterDto): Promise<{ email: string; otpRequired: true }> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      phone: dto.phone,
      passwordHash,
    });
    await this.issueOtp(user, OtpPurpose.Verify, OtpChannel.Email);
    // Trace the referral if they registered from a recommendation link.
    if (dto.recommendationToken) {
      await this.recommendations.linkToUser(dto.recommendationToken, user.id).catch(() => undefined);
    }
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      metadata: dto.recommendationToken ? { viaRecommendation: true } : undefined,
    });
    return { email: user.email, otpRequired: true };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthSession> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      await this.audit.record({
        action: 'auth.verify_otp',
        outcome: 'failure',
        actorEmail: dto.email,
        metadata: { reason: 'no_such_user' },
      });
      throw new UnauthorizedException('Invalid code');
    }
    try {
      await this.consumeOtp(user, dto.code, OtpPurpose.Verify);
    } catch (err) {
      await this.audit.record({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.verify_otp',
        outcome: 'failure',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'invalid_code' },
      });
      throw err;
    }
    user.emailVerified = true;
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.verify_otp',
      entityType: 'user',
      entityId: user.id,
    });
    return this.issueSession(user);
  }

  async resendOtp(email: string): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(email);
    // Don't leak whether the account exists.
    if (user && !user.emailVerified) {
      await this.issueOtp(user, OtpPurpose.Verify, OtpChannel.Email);
    }
    return { ok: true };
  }

  // ---- Login ----

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status === UserStatus.Disabled) {
      await this.recordLoginFailure(dto.email, user?.id, !user ? 'no_such_user' : 'account_disabled');
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.recordLoginFailure(dto.email, user.id, 'invalid_password');
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerified) {
      // Re-trigger verification rather than logging an unverified user in.
      await this.issueOtp(user, OtpPurpose.Verify, OtpChannel.Email);
      await this.recordLoginFailure(dto.email, user.id, 'email_unverified');
      throw new UnauthorizedException('Email not verified — a new code has been sent');
    }
    user.lastLoginAt = new Date();
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    });
    return this.issueSession(user);
  }

  private async recordLoginFailure(email: string, userId: string | undefined, reason: string): Promise<void> {
    await this.audit.record({
      action: 'auth.login',
      outcome: 'failure',
      actorUserId: userId ?? null,
      actorEmail: email,
      entityType: 'user',
      entityId: userId,
      metadata: { reason },
    });
  }

  // ---- Password reset ----

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(dto.email);
    if (user) {
      const code = await this.issueOtp(user, OtpPurpose.Reset, OtpChannel.Email, true);
      await this.notifications.sendPasswordReset(user.email, code);
    }
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.consumeOtp(user, dto.code, OtpPurpose.Reset);
    user.passwordHash = await argon2.hash(dto.password);
    user.refreshTokenHash = null; // invalidate existing sessions
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.reset_password',
      entityType: 'user',
      entityId: user.id,
    });
    return { ok: true };
  }

  // ---- Tokens ----

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const matches = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueSession(user);
  }

  async logout(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findById(userId);
    if (user) {
      user.refreshTokenHash = null;
      await this.users.save(user);
    }
    await this.audit.record({
      actorUserId: userId,
      actorEmail: user?.email ?? null,
      actorRole: user?.role ?? null,
      action: 'auth.logout',
      entityType: 'user',
      entityId: userId,
    });
    return { ok: true };
  }

  // ---- Internals ----

  private async issueSession(user: User): Promise<AuthSession> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.config.getOrThrow<string>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.config.getOrThrow<string>('jwt.refreshTtl'),
    });
    user.refreshTokenHash = await argon2.hash(refreshToken);
    await this.users.save(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /** Authenticated password change — clears the forced-change flag on success. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const user = await this.users.getByIdOrThrow(userId);
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      await this.audit.record({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.change_password',
        outcome: 'failure',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'invalid_current_password' },
      });
      throw new UnauthorizedException('Your current password is incorrect');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('Choose a password different from your temporary one');
    }
    user.passwordHash = await argon2.hash(newPassword);
    user.mustChangePassword = false;
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.change_password',
      entityType: 'user',
      entityId: user.id,
    });
    return { ok: true };
  }

  /** Generates a numeric OTP, stores its hash, sends it, and returns the plaintext (for reset link reuse). */
  private async issueOtp(
    user: User,
    purpose: OtpPurpose,
    channel: OtpChannel,
    skipSend = false,
  ): Promise<string> {
    // Invalidate any outstanding codes for the same purpose.
    await this.otps.delete({ userId: user.id, purpose });

    const length = this.config.getOrThrow<number>('otp.length');
    const code = this.randomDigits(length);
    const ttlMinutes = this.config.getOrThrow<number>('otp.ttlMinutes');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.otps.insert({
      userId: user.id,
      codeHash: await argon2.hash(code),
      channel,
      purpose,
      expiresAt,
      attempts: 0,
    });

    if (!skipSend) {
      await this.notifications.sendOtp(user.email, code, channel);
    }
    return code;
  }

  private async consumeOtp(user: User, code: string, purpose: OtpPurpose): Promise<void> {
    // Opportunistic cleanup of expired codes.
    await this.otps.delete({ userId: user.id, purpose, expiresAt: LessThan(new Date()) });

    const otp = await this.otps.findOne({
      where: { userId: user.id, purpose },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.consumedAt) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const maxAttempts = this.config.getOrThrow<number>('otp.maxAttempts');
    if (otp.attempts >= maxAttempts) {
      throw new BadRequestException('Too many attempts — request a new code');
    }
    const ok = await argon2.verify(otp.codeHash, code);
    if (!ok) {
      otp.attempts += 1;
      await this.otps.save(otp);
      throw new UnauthorizedException('Invalid or expired code');
    }
    otp.consumedAt = new Date();
    await this.otps.save(otp);
  }

  private randomDigits(length: number): string {
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += String(randomInt(0, 10));
    }
    return out;
  }
}
