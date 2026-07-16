import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An IP address denied access at authentication time. Added automatically after
 * repeated inspection/dev-tools attempts (reason 'automated') or manually by an
 * admin. Removable only by an admin (or by clearing the row + restarting).
 */
@Entity('blocked_ips')
export class BlockedIp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  ip!: string;

  /** 'automated' (tamper strikes) or 'manual' (admin-added). */
  @Column({ type: 'varchar', default: 'manual' })
  reason!: string;

  /** Free-text note (admin) or the trigger detail (automated). */
  @Column({ type: 'varchar', nullable: true })
  note!: string | null;

  /** Admin who added it; null when the system auto-blocked. */
  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
