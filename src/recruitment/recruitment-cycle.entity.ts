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

  /** Per-cycle sequence backing the ZB-IDR-{year}-#### reference number. */
  @Column({ name: 'reference_seq', type: 'int', default: 0 })
  referenceSeq!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => Application, (a) => a.cycle)
  applications!: Application[];
}
