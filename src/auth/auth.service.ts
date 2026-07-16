import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomInt, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { SecurityService } from '../security/security.service';
import { TotpService } from './totp.service';
import { User } from '../users/user.entity';
import { Otp } from './otp.entity';
import { OtpChannel, OtpPurpose, UserRole, UserStatus } from '../common/enums';
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

/** Returned mid-login instead of a session when another factor/confirmation
 *  is still needed. The frontend branches on which flag is present. */
export interface LoginChallenge {
  challengeToken: string;
  twoFactorRequired?: true;
  sessionConflict?: true;
  existingSession?: { ip: string | null; userAgent: string | null; at: string };
}

/** Absolute session ceiling — enforced at refresh time regardless of activity. */
const SESSION_MAX_MINUTES = 15;

/** A real argon2 hash of a throwaway value. When login is attempted for an
 *  unknown/disabled account we still run argon2.verify against this so the
 *  response time matches the real-user path — closing the timing side-channel
 *  that would otherwise reveal which emails have accounts. */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$DtPhu4aDOp7vmPRa9LS1Xg$uJRu9qwKd4HfSq4fL1pjRMoWf0e2I8WkHRGaT4d233Y';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly recommendations: RecommendationsService,
    private readonly security: SecurityService,
    private readonly totp: TotpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(Otp)
    private readonly otps: Repository<Otp>,
  ) {}

  // ---- Registration & verification ----

  /** When true (OTP_DEV_MODE), the verification code is returned in the API response
   *  so demo/test deployments without email can still complete sign-up. */
  private get devMode(): boolean {
    return this.config.get<boolean>('otp.devMode') ?? false;
  }

  /** Number of digits in an email OTP — surfaced to the client so the
   *  verify-code UI renders the right number of inputs regardless of the
   *  server's configured OTP_LENGTH. */
  private get otpLength(): number {
    return this.config.getOrThrow<number>('otp.length');
  }

  async register(dto: RegisterDto): Promise<{ email: string; otpRequired: true; otpLength: number; devCode?: string }> {
    this.security.assertRequestAllowed();
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
    const code = await this.issueOtp(user, OtpPurpose.Verify, OtpChannel.Email);
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
    return { email: user.email, otpRequired: true, otpLength: this.otpLength, ...(this.devMode ? { devCode: code } : {}) };
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
    return this.issueSession(user, true);
  }

  async resendOtp(email: string): Promise<{ ok: true; otpLength: number; devCode?: string }> {
    const user = await this.users.findByEmail(email);
    // Don't leak whether the account exists.
    if (user && !user.emailVerified) {
      const code = await this.issueOtp(user, OtpPurpose.Verify, OtpChannel.Email);
      if (this.devMode) return { ok: true, otpLength: this.otpLength, devCode: code };
    }
    return { ok: true, otpLength: this.otpLength };
  }

  // ---- Login ----

  /** Password check only. Returns a real session immediately if no further
   *  factor is needed, or a short-lived challenge token if 2FA and/or a
   *  single-sign-on conflict still needs resolving — see verifyTotpLogin /
   *  confirmSessionAndLogin. */
  async login(dto: LoginDto): Promise<AuthSession | LoginChallenge> {
    this.security.assertRequestAllowed();
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status === UserStatus.Disabled) {
      // Equalize timing with the real-user path (argon2 is the expensive step)
      // so an attacker can't distinguish "no such account" from "wrong password".
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
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
    if (user.totpEnabled) {
      return { twoFactorRequired: true, challengeToken: await this.signChallenge(user.id, 'totp') };
    }
    return this.afterFactorsVerified(user);
  }

  /** Second step when totpEnabled — verifies the authenticator code against
   *  the challenge issued by login(), then proceeds exactly like login()
   *  would have (including the single-sign-on conflict check). */
  async verifyTotpLogin(dto: { challengeToken: string; code: string }): Promise<AuthSession | LoginChallenge> {
    const userId = await this.verifyChallenge(dto.challengeToken, 'totp');
    const user = await this.users.getByIdOrThrow(userId);
    if (!user.totpSecret || !this.totp.verify(user.totpSecret, dto.code)) {
      await this.recordLoginFailure(user.email, user.id, 'invalid_totp');
      throw new UnauthorizedException('Invalid authentication code');
    }
    return this.afterFactorsVerified(user);
  }

  /** Final step when an existing active session was detected — the caller
   *  has already seen and accepted "this will sign out your other session". */
  async confirmSessionAndLogin(dto: { challengeToken: string }): Promise<AuthSession> {
    const userId = await this.verifyChallenge(dto.challengeToken, 'session-confirm');
    const user = await this.users.getByIdOrThrow(userId);
    return this.completeLogin(user);
  }

  /** All password/2FA factors are satisfied — last gate is single sign-on. */
  private async afterFactorsVerified(user: User): Promise<AuthSession | LoginChallenge> {
    const conflict = await this.detectSessionConflict(user);
    if (conflict) {
      return {
        sessionConflict: true,
        challengeToken: await this.signChallenge(user.id, 'session-confirm'),
        existingSession: conflict,
      };
    }
    return this.completeLogin(user);
  }

  /** An existing session is "active" if a refresh token is on file — single
   *  slot by design, so this is exactly "would issuing a new session here
   *  sign someone else out". */
  private async detectSessionConflict(
    user: User,
  ): Promise<{ ip: string | null; userAgent: string | null; at: string } | null> {
    if (!user.refreshTokenHash) return null;
    return this.audit.lastSuccessfulLogin(user.id);
  }

  private async completeLogin(user: User): Promise<AuthSession> {
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
    return this.issueSession(user, true);
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

  // ---- Two-factor authentication (TOTP) — every role except applicant ----

  /** Generates a new secret and QR code. Not enabled yet — the user must
   *  prove they scanned it correctly via confirmTotpSetup before it's active,
   *  so a half-finished setup can never lock someone out of their own account. */
  async setupTotp(userId: string): Promise<{ secret: string; qrDataUri: string }> {
    const user = await this.users.getByIdOrThrow(userId);
    if (user.role === UserRole.Applicant) {
      throw new ForbiddenException('Two-factor authentication is only available to staff accounts');
    }
    const secret = this.totp.generateSecret();
    user.totpSecret = secret;
    user.totpEnabled = false;
    await this.users.save(user);
    const qrDataUri = await this.totp.buildQrDataUri(user.email, secret);
    return { secret, qrDataUri };
  }

  async confirmTotpSetup(userId: string, code: string): Promise<{ ok: true }> {
    const user = await this.users.getByIdOrThrow(userId);
    if (!user.totpSecret || !this.totp.verify(user.totpSecret, code)) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    user.totpEnabled = true;
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'auth.totp_enabled',
      entityType: 'user',
      entityId: user.id,
    });
    return { ok: true };
  }

  async disableTotp(userId: string, password: string, code: string): Promise<{ ok: true }> {
    const user = await this.users.getByIdOrThrow(userId);
    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword || !user.totpSecret || !this.totp.verify(user.totpSecret, code)) {
      throw new UnauthorizedException('Incorrect password or authentication code');
    }
    user.totpEnabled = false;
    user.totpSecret = null;
    await this.users.save(user);
    await this.audit.record({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'auth.totp_disabled',
      entityType: 'user',
      entityId: user.id,
    });
    return { ok: true };
  }

  // ---- Mid-login challenge tokens ----

  /** Signed with a DIFFERENT secret from real access tokens (see
   *  configuration.ts) so it can never pass JwtStrategy even if sent as a
   *  Bearer token — these endpoints verify it manually instead. */
  private signChallenge(userId: string, purpose: 'totp' | 'session-confirm'): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, purpose },
      { secret: this.config.getOrThrow<string>('jwt.challengeSecret'), expiresIn: '5m' },
    );
  }

  private async verifyChallenge(token: string, expectedPurpose: 'totp' | 'session-confirm'): Promise<string> {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow<string>('jwt.challengeSecret') });
    } catch {
      throw new UnauthorizedException('Your login attempt has expired — please sign in again');
    }
    if (payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException('Invalid login attempt');
    }
    return payload.sub;
  }

  // ---- Password reset ----

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    this.security.assertRequestAllowed();
    const user = await this.users.findByEmail(dto.email);
    if (user) {
      const code = await this.issueOtp(user, OtpPurpose.Reset, OtpChannel.Email, true);
      await this.notifications.sendPasswordReset(user.email, user.phone, code);
    }
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    this.security.assertRequestAllowed();
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.consumeOtp(user, dto.code, OtpPurpose.Reset);
    user.passwordHash = await argon2.hash(dto.password);
    user.refreshTokenHash = null; // invalidate existing sessions
    user.activeSessionId = null; // ...and any already-issued access token, immediately
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
    if (!user || !user.refreshTokenHash || user.status === UserStatus.Disabled) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const matches = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Absolute session cap — enforced here regardless of how active the user
    // has been, since refresh is the one thing every extended session must
    // eventually pass through. Client-side idle/absolute timers give the UX
    // (auto-redirect before this ever fires); this is the backend backstop.
    const startedAt = user.sessionStartedAt?.getTime() ?? 0;
    if (Date.now() - startedAt > SESSION_MAX_MINUTES * 60_000) {
      user.refreshTokenHash = null;
      user.activeSessionId = null;
      await this.users.save(user);
      throw new UnauthorizedException('Your session has expired — please sign in again');
    }
    return this.issueSession(user, false);
  }

  async logout(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findById(userId);
    if (user) {
      user.refreshTokenHash = null;
      // Also kills the current access token immediately (JwtStrategy checks
      // this every request) instead of leaving it valid until its own TTL —
      // otherwise a logged-out token could keep working, including calling
      // this very endpoint again and clobbering a different session's state.
      user.activeSessionId = null;
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

  /** freshLogin=true (password/2FA/session-confirm just completed) resets the
   *  15-minute absolute-session clock AND rotates activeSessionId — which is
   *  what immediately invalidates every access/refresh token from whatever
   *  session existed before (JwtStrategy checks activeSessionId on every
   *  request, so this takes effect on the other session's very next call,
   *  not just whenever it would next try to refresh). A token refresh
   *  (freshLogin=false) deliberately leaves both untouched — that's what
   *  makes the session cap absolute rather than just another idle timeout,
   *  and keeps the refreshed token part of the same session. */
  private async issueSession(user: User, freshLogin: boolean): Promise<AuthSession> {
    if (freshLogin) {
      user.sessionStartedAt = new Date();
      user.activeSessionId = randomUUID();
    }
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
      sid: user.activeSessionId!,
    };
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
      await this.notifications.sendOtp(user.email, user.phone, code);
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
