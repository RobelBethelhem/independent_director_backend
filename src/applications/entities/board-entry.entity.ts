import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity('board_entries')
@Index(['applicationId'])
export class BoardEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.boards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ type: 'varchar', nullable: true })
  org!: string | null;

  @Column({ type: 'varchar', nullable: true })
  position!: string | null;

  @Column({ type: 'varchar', nullable: true })
  type!: string | null;

  @Column({ name: 'from_month', type: 'varchar', nullable: true })
  fromMonth!: string | null;

  @Column({ name: 'to_month', type: 'varchar', nullable: true })
  toMonth!: string | null;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;

  /** Legacy free-text period (kept for older records). */
  @Column({ type: 'varchar', nullable: true })
  period!: string | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
