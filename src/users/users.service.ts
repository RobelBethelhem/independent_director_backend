import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './user.entity';
import { UserRole } from '../common/enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: this.normalizeEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  create(data: {
    email: string;
    phone: string | null;
    passwordHash: string;
    role?: UserRole;
    name?: string | null;
    emailVerified?: boolean;
    mustChangePassword?: boolean;
  }): Promise<User> {
    const user = this.users.create({
      email: this.normalizeEmail(data.email),
      name: data.name ?? null,
      phone: data.phone,
      passwordHash: data.passwordHash,
      role: data.role ?? UserRole.Applicant,
      emailVerified: data.emailVerified ?? false,
      mustChangePassword: data.mustChangePassword ?? false,
    });
    return this.users.save(user);
  }

  findByRole(role: UserRole): Promise<User[]> {
    return this.users.find({ where: { role }, order: { createdAt: 'ASC' } });
  }

  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.users.findBy({ id: In(ids) });
  }

  save(user: User): Promise<User> {
    return this.users.save(user);
  }
}
