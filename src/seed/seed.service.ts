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

    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@zemen.test').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
    await this.users.create({
      email,
      phone: null,
      passwordHash: await argon2.hash(password),
      role: UserRole.Admin,
      name: 'Administrator',
      emailVerified: true,
    });
    this.logger.warn(`Seeded initial administrator "${email}". Sign in and change the password immediately.`);
  }
}
