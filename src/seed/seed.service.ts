import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/enums';

/**
 * Bootstraps a first administrator on a fresh deployment so the team can sign in.
 * Controlled by SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD; no-op once an admin exists.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly users: UsersService) {}

  async onApplicationBootstrap(): Promise<void> {
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
}
