import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An IP address denied access at authentication time. Added and removed by an
 * admin (see AdminController → "Blocked IPs"). Removable only by an admin (or by
 * clearing the row + restarting the API).
 */
@Entity('blocked_ips')
export class BlockedIp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  ip!: string;

  /** Always 'manual' now (admin-added); kept for forward compatibility. */
  @Column({ type: 'varchar', default: 'manual' })
  reason!: string;

  /** Admin's free-text note for why the IP was blocked. */
  @Column({ type: 'varchar', nullable: true })
  note!: string | null;

  /** The admin user who added the block. */
  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
