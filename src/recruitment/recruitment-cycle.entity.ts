import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from '../applications/entities/application.entity';

@Entity('recruitment_cycles')
export class RecruitmentCycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar', default: 'Independent Director' })
  position!: string;

  @Column({ name: 'opens_at', type: 'timestamptz' })
  opensAt!: Date;

  @Column({ name: 'submission_close_at', type: 'timestamptz' })
  submissionCloseAt!: Date;

  /**
   * When reviewers gain (and lose) access — purely time-based, no manual
   * override: opens automatically the moment submissionCloseAt passes, closes
   * automatically at reviewCloseAt. Nullable at the DB level for schema
   * safety, but treated as mandatory at the application level — a cycle
   * without one is deliberately kept conservative (admin status changes stay
   * locked) until an admin sets it via Review Settings. See
   * RecruitmentService.isReviewActive / isStatusLocked.
   */
  @Column({ name: 'review_close_at', type: 'timestamptz', nullable: true })
  reviewCloseAt!: Date | null;

  /** Per-cycle sequence backing the ZB-IDR-{year}-#### reference number. */
  @Column({ name: 'reference_seq', type: 'int', default: 0 })
  referenceSeq!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => Application, (a) => a.cycle)
  applications!: Application[];
}
