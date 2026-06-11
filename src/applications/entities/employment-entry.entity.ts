import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity('employment_entries')
@Index(['applicationId'])
export class EmploymentEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.employment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ type: 'varchar', nullable: true })
  org!: string | null;

  @Column({ type: 'varchar', nullable: true })
  role!: string | null;

  @Column({ name: 'from_month', type: 'varchar', nullable: true })
  fromMonth!: string | null;

  @Column({ name: 'to_month', type: 'varchar', nullable: true })
  toMonth!: string | null;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
