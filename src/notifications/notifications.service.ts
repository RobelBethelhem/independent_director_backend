import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Transactional email sender. Sends via SMTP (Mailpit in dev, or a real provider
 * such as SendGrid/SES/Gmail in prod — just change the SMTP_* env vars). If the
 * SMTP server can't be reached it logs the message instead, so local dev never
 * blocks on mail delivery. (SMS is still a stub — wire a gateway/Twilio later.)
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter;
  private from: string;
  private ready = false;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.getOrThrow<string>('mail.from');
    const user = this.config.get<string>('mail.user');
    const tlsInsecure = this.config.get<boolean>('mail.tlsInsecure');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('mail.host'),
      port: this.config.getOrThrow<number>('mail.port'),
      secure: this.config.getOrThrow<boolean>('mail.secure'),
      auth: user ? { user, pass: this.config.get<string>('mail.pass') } : undefined,
      // On TLS-intercepting networks the proxy's cert can't be verified; allow
      // skipping verification in dev only (SMTP_TLS_INSECURE=true).
      ...(tlsInsecure ? { tls: { rejectUnauthorized: false } } : {}),
    });
    if (tlsInsecure) {
      this.logger.warn('SMTP TLS verification DISABLED (SMTP_TLS_INSECURE=true) — dev only');
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.transporter.verify();
      this.ready = true;
      this.logger.log('SMTP transport ready');
    } catch (err) {
      this.logger.warn(`SMTP not reachable — emails will be logged only: ${(err as Error).message}`);
    }
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.ready) {
      this.logger.log(`[email:logged] to=${to} subject="${subject}" :: ${text}`);
      return;
    }
    try {
      const info = await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`[email:sent] to=${to} subject="${subject}" id=${info.messageId}`);
    } catch (err) {
      // Never let a mail failure break the request flow.
      this.logger.error(`[email:failed] to=${to} subject="${subject}" :: ${(err as Error).message}`);
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

  async sendOtp(to: string, code: string, channel: 'email' | 'sms'): Promise<void> {
    if (channel === 'sms') {
      this.logger.log(`[sms:stub] to=${to} code=${code}`);
      return;
    }
    const html = this.layout(
      'Verify your email',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Use this one-time code to verify your account and continue your application:</p>
       <div style="font-size:34px;font-weight:700;letter-spacing:.4em;text-align:center;color:#ed1d24;margin:18px 0;padding:14px;background:#fcebeb;border-radius:10px">${code}</div>
       <p style="font-size:13px;color:#8a827a">This code expires shortly. Do not share it with anyone.</p>`,
    );
    await this.send(to, `Your Zemen verification code: ${code}`, html, `Your verification code is ${code}`);
  }

  async sendPasswordReset(to: string, code: string): Promise<void> {
    const html = this.layout(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">Use this code to reset your password:</p>
       <div style="font-size:34px;font-weight:700;letter-spacing:.4em;text-align:center;color:#ed1d24;margin:18px 0;padding:14px;background:#fcebeb;border-radius:10px">${code}</div>`,
    );
    await this.send(to, `Your Zemen password reset code: ${code}`, html, `Your reset code is ${code}`);
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

  async sendStatusUpdate(to: string, statusLabel: string): Promise<void> {
    const html = this.layout(
      'Application status updated',
      `<p style="font-size:14px;line-height:1.6;color:#57504a">There is an update to your Independent Director application. Its status is now:</p>
       <div style="font-size:16px;font-weight:700;text-align:center;margin:16px 0;padding:12px;background:#fbf8f2;border:1px solid #e7e0d4;border-radius:10px">${statusLabel}</div>
       <p style="font-size:13px;color:#8a827a">Sign in to your tracker for details.</p>`,
    );
    await this.send(to, `Your Zemen application status: ${statusLabel}`, html, `Your application status is now ${statusLabel}`);
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
