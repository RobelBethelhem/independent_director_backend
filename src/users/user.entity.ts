import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole, UserStatus } from '../common/enums';
import { Application } from '../applications/entities/application.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Stored normalized to lowercase by UsersService so the unique index is case-insensitive.
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Applicant })
  role!: UserRole;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'phone_verified', type: 'boolean', default: false })
  phoneVerified!: boolean;

  /** True for admin-provisioned staff with a temp password — forces a change on first login. */
  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.Active })
  status!: UserStatus;

  /** Hashed refresh token (rotation). Null when logged out. Single slot by
   *  design — issuing a new one (a fresh login) invalidates any other
   *  session, which is what makes single sign-on enforceable at all. */
  @Column({ name: 'refresh_token_hash', type: 'varchar', nullable: true })
  refreshTokenHash!: string | null;

  /** Set once at fresh login (password [+ 2FA] [+ session-conflict confirm]),
   *  never touched by refresh — the hard ceiling for the 15-minute absolute
   *  session cap, enforced at refresh time regardless of activity. */
  @Column({ name: 'session_started_at', type: 'timestamptz', nullable: true })
  sessionStartedAt!: Date | null;

  /** TOTP (Google Authenticator-compatible) 2FA — available to every role
   *  except applicant. Secret is stored plain (standard practice for TOTP —
   *  it must be readable to verify codes, unlike a password hash) and only
   *  ever set once totpEnabled flips true via a confirmed setup. */
  @Column({ name: 'totp_secret', type: 'varchar', nullable: true })
  totpSecret!: string | null;

  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @OneToMany(() => Application, (a) => a.applicant)
  applications!: Application[];
}
