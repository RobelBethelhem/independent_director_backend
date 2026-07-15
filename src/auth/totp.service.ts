import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

const ISSUER = 'Zemen Independent Director Portal';

/** TOTP (Google Authenticator-compatible) secret generation and verification. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /** otpauth:// URI encoded as a scannable QR code data: URI. */
  async buildQrDataUri(email: string, secret: string): Promise<string> {
    const otpauth = authenticator.keyuri(email, ISSUER, secret);
    return QRCode.toDataURL(otpauth);
  }

  /** Accepts the previous/current/next 30s window to tolerate clock drift. */
  verify(secret: string, code: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch {
      return false;
    }
  }
}
