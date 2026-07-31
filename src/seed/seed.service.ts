import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/enums';

/**
 * Bootstraps a first administrator on a fresh deployment so the team can sign in,
 * and optionally a dedicated support agent. Controlled by SEED_* env vars.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly users: UsersService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedAdmin();
    await this.seedSupport();
  }

  private async seedAdmin(): Promise<void> {
    const existing = await this.users.findByRole(UserRole.Admin);
    if (existing.length > 0) return;

    // No predictable in-code defaults for the initial admin (pentest 2.2.3.3):
    // both the email and password MUST be supplied explicitly, and the password
    // must be strong. Fail loudly rather than seed a publicly-known credential.
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'Cannot seed the initial administrator: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the environment.',
      );
    }
    if (password.length < 12 || /change|replace|password|admin123|123456|qwerty/i.test(password)) {
      throw new Error(
        'SEED_ADMIN_PASSWORD is too weak or a placeholder — use a strong, unique value (≥12 characters).',
      );
    }

    await this.users.create({
      email,
      phone: null,
      passwordHash: await argon2.hash(password),
      role: UserRole.Admin,
      name: 'Administrator',
      emailVerified: true,
      // Force a password change on first login so even the operator-chosen seed
      // password is never a standing credential.
      mustChangePassword: true,
    });
    this.logger.warn(`Seeded initial administrator "${email}". You must change the password on first sign-in.`);
  }

  /**
   * Optional dedicated support agent. Skipped entirely when SEED_SUPPORT_* are
   * unset — admins can staff the support console directly, so this never blocks
   * boot. Only seeds when no support user exists yet.
   */
  private async seedSupport(): Promise<void> {
    const email = process.env.SEED_SUPPORT_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_SUPPORT_PASSWORD;
    if (!email || !password) return;
    if ((await this.users.findByRole(UserRole.Support)).length > 0) return;
    if (password.length < 12 || /change|replace|password|123456|qwerty/i.test(password)) {
      this.logger.warn('SEED_SUPPORT_PASSWORD is too weak or a placeholder — skipping support-agent seed.');
      return;
    }
    await this.users.create({
      email,
      phone: null,
      passwordHash: await argon2.hash(password),
      role: UserRole.Support,
      name: 'Support',
      emailVerified: true,
      mustChangePassword: true,
    });
    this.logger.warn(`Seeded support agent "${email}". Change the password on first sign-in.`);
  }
}
