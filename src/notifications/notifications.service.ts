import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Transactional email + SMS sender. Email sends via SMTP (Mailpit in dev, or a
 * real provider such as SendGrid/SES/Gmail in prod — just change the SMTP_*
 * env vars). SMS sends via the Bank's internal HTTP gateway (SMS_* env vars).
 * If either isn't configured / can't be reached, the message is logged
 * instead so a delivery failure never blocks the request flow.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter;
  private from: string;
  private ready = false;
  private smsUrl: string;
  private smsUsername: string;
  private smsPassword: string;
  private smsFrom: string;
  /** Never write OTP/reset codes or temp passwords to logs in production. In
   *  dev the body is logged so testers without SMTP can read the code. */
  private readonly logMessageBodies: boolean;

  constructor(private readonly config: ConfigService) {
    this.logMessageBodies = this.config.get<string>('env') !== 'production';
    this.from = this.config.getOrThrow<string>('mail.from');
    const user = this.config.get<string>('mail.user');
    const tlsInsecure = this.config.get<boolean>('mail.tlsInsecure');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('mail.host'),
      port: this.config.getOrThrow<number>('mail.port'),
      secure: this.config.getOrThrow<boolean>('mail.secure'),
      auth: user ? { user, pass: this.config.get<string>('mail.pass') } : undefined,
      // Fail fast instead of nodemailer's ~2min default — an unreachable SMTP
      // host must never make app startup or a live send hang that long.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      // On TLS-intercepting networks the proxy's cert can't be verified; allow
      // skipping verification in dev only (SMTP_TLS_INSECURE=true).
      ...(tlsInsecure ? { tls: { rejectUnauthorized: false } } : {}),
    });
    if (tlsInsecure) {
      this.logger.warn('SMTP TLS verification DISABLED (SMTP_TLS_INSECURE=true) — dev only');
    }
    this.smsUrl = this.config.getOrThrow<string>('sms.url');
    this.smsUsername = this.config.get<string>('sms.username') ?? '';
    this.smsPassword = this.config.get<string>('sms.password') ?? '';
    this.smsFrom = this.config.get<string>('sms.from') ?? '';
    if (!this.smsUsername) {
      this.logger.warn('SMS gateway not configured (SMS_USERNAME empty) — SMS will be logged only');
    }
  }

  /** Fire-and-forget: app startup (and its health check) must never be gated
   *  on an external SMTP server responding — see the 10s timeouts above. */
  onModuleInit(): void {
    void this.checkSmtp();
  }

  private async checkSmtp(): Promise<void> {
    try {
      await this.transporter.verify();
      this.ready = true;
      this.logger.log('SMTP transport ready');
    } catch (err) {
      this.logger.warn(`SMTP not reachable — emails will be logged only: ${(err as Error).message}`);
    }
  }

  /** Retries a transient failure once more after a short delay (2 attempts
   *  total). Used for both email and SMS sends so a bulk batch's overall
   *  delivery rate isn't at the mercy of a single flaky moment. */
  private async withRetry<T>(op: () => Promise<T>, attempts = 2, delayMs = 1500): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await op();
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  /** Returns true only if actually delivered via SMTP — false both when the
   *  message was merely logged (SMTP unconfigured) and when a real send
   *  attempt failed. Callers that need to track delivery (bulk sends) use
   *  this; fire-and-forget callers (OTP, etc.) can ignore it. Never throws —
   *  a mail failure must never break the caller's request flow. */
  private async send(to: string, subject: string, html: string, text: string): Promise<boolean> {
    if (!this.ready) {
      // Body (which may contain an OTP/reset code) is logged in dev only.
      this.logger.log(
        `[email:logged] to=${to} subject="${subject}"${this.logMessageBodies ? ` :: ${text}` : ''}`,
      );
      return false;
    }
    try {
      const info = await this.withRetry(() => this.transporter.sendMail({ from: this.from, to, subject, text, html }));
      this.logger.log(`[email:sent] to=${to} subject="${subject}" id=${info.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(`[email:failed] to=${to} subject="${subject}" :: ${(err as Error).message}`);
      return false;
    }
  }

  /** Gateway expects a bare 251-prefixed number, no '+'. Handles both our own
   *  +251-formatted numbers and a stray leading-0 local format defensively. */
  private formatPhoneForSms(phone: string): string {
    let p = phone.replace(/^\+/, '');
    if (p.startsWith('0')) p = `251${p.slice(1)}`;
    return p;
  }

  /** Same true-only-if-actually-delivered contract as send() above. A 10s
   *  request timeout stops a hanging gateway from stalling an entire bulk
   *  batch on one recipient. */
  private async sendSms(phone: string, message: string): Promise<boolean> {
    const to = this.formatPhoneForSms(phone);
    if (!this.smsUsername) {
      // Body (which may contain an OTP/reset code) is logged in dev only.
      this.logger.log(`[sms:logged] to=${to}${this.logMessageBodies ? ` :: ${message}` : ''}`);
      return false;
    }
    const url =
      `${this.smsUrl}?username=${encodeURIComponent(this.smsUsername)}` +
      `&password=${encodeURIComponent(this.smsPassword)}` +
      `&to=${encodeURIComponent(to)}` +
      `&from=${encodeURIComponent(this.smsFrom)}` +
      `&coding=8&content=${encodeURIComponent(message)}`;
    try {
      await this.withRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            throw new Error(`gateway returned ${res.status}`);
          }
        } finally {
          clearTimeout(timeout);
        }
      });
      this.logger.log(`[sms:sent] to=${to}`);
      return true;
    } catch (err) {
      this.logger.error(`[sms:failed] to=${to} :: ${(err as Error).message}`);
      return false;
    }
  }

  // ---- Branded HTML wrapper ----
  private layout(heading: string, body: string): string {
    return `<!doctype html><html><body style="margin:0;background:#f7f3ec;font-family:Arial,Helvetica,sans-serif;color:#1a1613">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e7e0d4;border-radius:16px;overflow:hidden">
          <tr><td style="background:#1a1613;padding:20px 28px;color:#fff;font-weight:700;letter-spacing:.04em">ZEMEN BANK · Independent Director Portal</td></tr>
          <tr><td style="padding:28px">
            <h1 style="font-size:20px;margin:0 0 14px">${heading}</h1>
            ${body}
            <p style="font-size:12px;color:#8a827a;margin-top:28px;line-height:1.5">If you did not request this, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
  }

  /** Sends the OTP over BOTH channels at once (best-effort, independent — a
   *  failure on one never blocks or fails the other). `phone` is optional
   *  since not every caller has it validated to hand. */
  async sendOtp(email: string, phone: string | null | undefined, code: string): Promise<void> {
    const html = this.layout(
      'Verify your email',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Use this one-time code to verify your account and continue your application:</p>
       <div style="font-size:34px;font-weight:700;letter-spacing:.4em;text-align:center;color:#ed1d24;margin:18px 0;padding:14px;background:#fcebeb;border-radius:10px">${code}</div>
       <p style="font-size:13px;color:#8a827a">This code expires shortly. Do not share it with anyone.</p>`,
    );
    await Promise.all([
      this.send(email, `Your Zemen verification code: ${code}`, html, `Your verification code is ${code}`),
      phone
        ? this.sendSms(phone, `Zemen Bank Independent Director Portal: your verification code is ${code}.`)
        : Promise.resolve(),
    ]);
  }

  /** Confirmation that the applicant's account was created & their email
   *  verified — sent once, right after successful sign-up verification. */
  async sendAccountCreated(email: string): Promise<void> {
    const html = this.layout(
      'Your account is ready',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Welcome to the Zemen Bank Independent Director Portal. Your account has been created and your email address verified.</p>
       <p style="font-size:14px;line-height:1.6;color:#57504a">You can now sign in at any time to complete and submit your Independent Director application before the window closes — your progress is saved automatically as you go.</p>
       <p style="font-size:13px;color:#8a827a">For your security, keep your sign-in details private. If you did not create this account, please contact the Secretariat.</p>`,
    );
    await this.send(
      email,
      'Your Zemen Independent Director Portal account is ready',
      html,
      'Welcome to the Zemen Bank Independent Director Portal. Your account has been created and your email verified. You can now sign in to complete your application.',
    );
  }

  async sendPasswordReset(email: string, phone: string | null | undefined, code: string): Promise<void> {
    const html = this.layout(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Use this code to reset your password:</p>
       <div style="font-size:34px;font-weight:700;letter-spacing:.4em;text-align:center;color:#ed1d24;margin:18px 0;padding:14px;background:#fcebeb;border-radius:10px">${code}</div>`,
    );
    await Promise.all([
      this.send(email, `Your Zemen password reset code: ${code}`, html, `Your reset code is ${code}`),
      phone
        ? this.sendSms(phone, `Zemen Bank Independent Director Portal: your password reset code is ${code}.`)
        : Promise.resolve(),
    ]);
  }

  async sendCredentials(to: string, role: string, tempPassword: string): Promise<void> {
    const html = this.layout(
      'Your reviewer account is ready',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">An account has been created for you on the Zemen Independent Director Portal with the role <b>${role}</b>. Sign in with:</p>
       <div style="font-size:13.5px;margin:14px 0;padding:14px;background:#fbf8f2;border:1px solid #e7e0d4;border-radius:10px">
         <div>Email: <b>${to}</b></div>
         <div style="margin-top:6px">Temporary password: <b style="font-family:monospace">${tempPassword}</b></div>
       </div>
       <p style="font-size:13px;color:#8a827a">Please sign in and change your password. If the link asks for a code, use “Forgot password”.</p>`,
    );
    await this.send(to, 'Your Zemen Director Portal account', html, `Email: ${to} · Temporary password: ${tempPassword}`);
  }

  /** Sends over both channels; returns true if AT LEAST ONE actually
   *  delivered (used by the bulk status-notification sender to decide
   *  whether this applicant can be marked as notified, or must stay queued
   *  for the next attempt). */
  async sendStatusUpdate(email: string, phone: string | null | undefined, statusLabel: string): Promise<boolean> {
    const html = this.layout(
      'Application status updated',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">There is an update to your Independent Director application. Its status is now:</p>
       <div style="font-size:16px;font-weight:700;text-align:center;margin:16px 0;padding:12px;background:#fbf8f2;border:1px solid #e7e0d4;border-radius:10px">${statusLabel}</div>
       <p style="font-size:13px;color:#8a827a">Sign in to your tracker for details.</p>`,
    );
    const [emailed, texted] = await Promise.all([
      this.send(email, `Your Zemen application status: ${statusLabel}`, html, `Your application status is now ${statusLabel}`),
      phone
        ? this.sendSms(phone, `Zemen Bank Independent Director Portal: your application status is now "${statusLabel}".`)
        : Promise.resolve(false),
    ]);
    return emailed || texted;
  }

  async sendMessageEmail(to: string, subject: string, body: string): Promise<void> {
    const html = this.layout(subject || 'A message from the Secretariat', `<p style="font-size:14px;line-height:1.7;color:#57504a;white-space:pre-wrap">${body}</p>`);
    await this.send(to, subject || 'A message regarding your application', html, body);
  }

  async sendRecommendationInvite(
    to: string,
    candidateName: string,
    recommenderName: string,
    message: string | null,
    link: string,
  ): Promise<void> {
    const note = message
      ? `<div style="font-size:13.5px;line-height:1.6;color:#57504a;margin:16px 0;padding:14px 16px;background:#fbf8f2;border-left:3px solid #ed1d24;border-radius:8px"><b>${recommenderName} writes:</b><br/>“${message}”</div>`
      : '';
    const html = this.layout(
      `You’ve been recommended for the Zemen Bank Board`,
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Dear ${candidateName},</p>
       <p style="font-size:14px;line-height:1.6;color:#57504a"><b>${recommenderName}</b> has recommended you as a strong candidate for an <b>Independent Director</b> position on the Board of Directors of Zemen Bank S.C.</p>
       ${note}
       <p style="font-size:14px;line-height:1.6;color:#57504a">Independent Directors bring objective, expert oversight to the Bank’s governance. We warmly invite you to submit your application through our secure portal.</p>
       <div style="text-align:center;margin:24px 0">
         <a href="${link}" style="display:inline-block;background:#ed1d24;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:10px">Start your application →</a>
       </div>
       <p style="font-size:12.5px;color:#8a827a;line-height:1.5">This invitation is personal to you. If you received it in error, you may disregard it.</p>
       <p style="font-size:13px;color:#57504a;margin-top:18px">— Nomination &amp; Remuneration Committee, Zemen Bank</p>`,
    );
    await this.send(
      to,
      `${recommenderName} recommended you for the Zemen Bank Board`,
      html,
      `${recommenderName} has recommended you for an Independent Director position at Zemen Bank. Apply here: ${link}`,
    );
  }

  async sendApplicationAcknowledgement(to: string, reference: string): Promise<void> {
    const html = this.layout(
      'Application received',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Thank you for applying for an Independent Director position. Your application reference is:</p>
       <div style="font-family:monospace;font-size:18px;text-align:center;margin:16px 0;padding:12px;background:#fbf8f2;border:1px solid #e7e0d4;border-radius:10px">${reference}</div>
       <p style="font-size:13px;color:#8a827a">Keep this reference for tracking and correspondence.</p>`,
    );
    await this.send(to, `Zemen application received — ${reference}`, html, `Application received. Reference: ${reference}`);
  }
}
