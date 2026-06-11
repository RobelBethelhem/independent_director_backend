import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationStatus } from '../../common/enums';
import { User } from '../../users/user.entity';
import { RecruitmentCycle } from '../../recruitment/recruitment-cycle.entity';
import { EducationEntry } from './education-entry.entity';
import { ProfessionalQual } from './professional-qual.entity';
import { EmploymentEntry } from './employment-entry.entity';
import { BoardEntry } from './board-entry.entity';
import { ExpertiseSelection } from './expertise.entity';
import { ReferenceContact } from './reference-contact.entity';
import { Declaration } from './declaration.entity';
import { ApplicationDocument } from './document.entity';

@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Null until submitted; assigned server-side as ZB-IDR-{year}-####. */
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  reference!: string | null;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId!: string;

  @ManyToOne(() => RecruitmentCycle, (c) => c.applications, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cycle_id' })
  cycle!: RecruitmentCycle;

  @Column({ name: 'applicant_user_id', type: 'uuid' })
  applicantUserId!: string;

  @ManyToOne(() => User, (u) => u.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicant_user_id' })
  applicant!: User;

  @Column({ type: 'enum', enum: ApplicationStatus, default: ApplicationStatus.Draft })
  status!: ApplicationStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  // ---- Step 1: Personal & contact ----
  @Column({ type: 'varchar', nullable: true })
  title!: string | null;

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName!: string | null;

  @Column({ name: 'middle_name', type: 'varchar', nullable: true })
  middleName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', nullable: true })
  lastName!: string | null;

  @Column({ type: 'date', nullable: true })
  dob!: string | null;

  @Column({ type: 'varchar', nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', nullable: true })
  nationality!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', nullable: true })
  city!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  // ---- Step 5: Conflicts free text ----
  @Column({ name: 'conflicts_text', type: 'text', nullable: true })
  conflictsText!: string | null;

  // ---- Step 8: Formal declaration / certification ----
  @Column({ type: 'boolean', default: false })
  certified!: boolean;

  @Column({ name: 'certified_at', type: 'timestamptz', nullable: true })
  certifiedAt!: Date | null;

  /** Denormalized count of "yes" declaration answers (independence flags). */
  @Column({ name: 'flags_count', type: 'int', default: 0 })
  flagsCount!: number;

  // ---- Wizard progress (server-persisted so it resumes on any device) ----
  @Column({ name: 'current_step', type: 'int', default: 0 })
  currentStep!: number;

  @Column({ name: 'max_step_seen', type: 'int', default: 0 })
  maxStepSeen!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // ---- Repeatable collections ----
  @OneToMany(() => EducationEntry, (e) => e.application, { cascade: true })
  education!: EducationEntry[];

  @OneToMany(() => ProfessionalQual, (e) => e.application, { cascade: true })
  professionalQuals!: ProfessionalQual[];

  @OneToMany(() => EmploymentEntry, (e) => e.application, { cascade: true })
  employment!: EmploymentEntry[];

  @OneToMany(() => BoardEntry, (e) => e.application, { cascade: true })
  boards!: BoardEntry[];

  @OneToMany(() => ExpertiseSelection, (e) => e.application, { cascade: true })
  expertise!: ExpertiseSelection[];

  @OneToMany(() => ReferenceContact, (e) => e.application, { cascade: true })
  references!: ReferenceContact[];

  @OneToMany(() => Declaration, (e) => e.application, { cascade: true })
  declarations!: Declaration[];

  @OneToMany(() => ApplicationDocument, (e) => e.application, { cascade: true })
  documents!: ApplicationDocument[];
}
