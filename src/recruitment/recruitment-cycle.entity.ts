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

  /** Admin-controlled gate that opens the reviewer console (URS: review window). */
  @Column({ name: 'review_unlocked', type: 'boolean', default: false })
  reviewUnlocked!: boolean;

  /** Null = no review deadline configured (reviewers may score indefinitely
   *  once unlocked — the legacy behavior). Once set, reviewers can no longer
   *  score/submit past this date, and admin's status-change controls lock for
   *  the duration the review window is active (opens the moment this is set
   *  and reviewUnlocked/submissionCloseAt has passed, through this date). */
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
