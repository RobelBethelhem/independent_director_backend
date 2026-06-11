import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity('reference_contacts')
@Index(['applicationId'])
export class ReferenceContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.references, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @Column({ name: 'position_org', type: 'varchar', nullable: true })
  positionOrg!: string | null;

  /** How the referee knows the applicant (required at submit). */
  @Column({ type: 'varchar', nullable: true })
  relationship!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
