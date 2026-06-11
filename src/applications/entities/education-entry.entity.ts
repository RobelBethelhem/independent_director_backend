import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity('education_entries')
@Index(['applicationId'])
export class EducationEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.education, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ type: 'varchar', nullable: true })
  degree!: string | null;

  @Column({ type: 'varchar', nullable: true })
  field!: string | null;

  @Column({ type: 'varchar', nullable: true })
  institution!: string | null;

  @Column({ type: 'varchar', nullable: true })
  year!: string | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
