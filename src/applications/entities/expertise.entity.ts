import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Application } from './application.entity';

/** One row per selected area of expertise (ZB.EXPERTISE). */
@Entity('expertise_selections')
@Unique(['applicationId', 'value'])
@Index(['applicationId'])
export class ExpertiseSelection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.expertise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ type: 'varchar' })
  value!: string;
}
