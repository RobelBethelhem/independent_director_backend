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

    const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';
    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@zemen.test').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

    // Never seed a production admin with a missing, placeholder, or weak
    // password — that would be a publicly-known credential (the default is in
    // this repo). Fail loudly so the operator sets a real one.
    if (isProduction) {
      const insecure =
        !process.env.SEED_ADMIN_PASSWORD ||
        password.length < 12 ||
        /change|replace|password|admin123/i.test(password);
      if (insecure) {
        throw new Error(
          'Refusing to seed the initial admin: set SEED_ADMIN_PASSWORD to a strong, unique value (≥12 chars, not a placeholder).',
        );
      }
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
