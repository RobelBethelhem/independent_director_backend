import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Append-only record of every privileged / state-changing action (URS §5). */
@Entity('audit_logs')
@Index(['actorUserId'])
@Index(['entityType', 'entityId'])
@Index(['action'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  /** Captured even for failed/anonymous attempts (e.g. a failed login email). */
  @Column({ name: 'actor_email', type: 'varchar', nullable: true })
  actorEmail!: string | null;

  /** Role of the actor at the time of the action. */
  @Column({ name: 'actor_role', type: 'varchar', nullable: true })
  actorRole!: string | null;

  @Column({ type: 'varchar' })
  action!: string;

  /** 'success' | 'failure'. */
  @Column({ type: 'varchar', default: 'success' })
  outcome!: string;

  @Column({ name: 'entity_type', type: 'varchar', nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entityId!: string | null;

  @Column({ name: 'http_method', type: 'varchar', nullable: true })
  method!: string | null;

  @Column({ type: 'varchar', nullable: true })
  path!: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
