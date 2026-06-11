import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity('professional_quals')
@Index(['applicationId'])
export class ProfessionalQual {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.professionalQuals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  /** Designation / qualification name. */
  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  /** Awarding body. */
  @Column({ type: 'varchar', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', nullable: true })
  year!: string | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
