import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Application } from './application.entity';
import { User } from '../../users/user.entity';

/** Stage 1 (Document Evaluation) is done — explicitly, or implied by a final
 *  / legacy single-stage submission. Use this, never documentSubmitted alone. */
export function isDocumentDone(r: Pick<Review, 'documentSubmitted' | 'submitted'> | null | undefined): boolean {
  return !!r && (r.documentSubmitted || r.submitted);
}

/** One reviewer's overall review of an application (comment + recommendation + computed score). */
@Entity('reviews')
@Unique(['applicationId', 'reviewerUserId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewer!: User;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'shortlist_recommended', type: 'boolean', default: false })
  shortlistRecommended!: boolean;

  /** FINAL submission — both stages done (document + interview). Legacy
   *  single-stage submissions also land here, so `submitted` alone always
   *  implies the document stage is done too. */
  @Column({ type: 'boolean', default: false })
  submitted!: boolean;

  /** Stage 1 — the Document Evaluation (50%) has been submitted and locked.
   *  Always read together with `submitted` (see isDocumentDone). */
  @Column({ name: 'document_submitted', type: 'boolean', default: false })
  documentSubmitted!: boolean;

  /** Stage points: Document Evaluation out of 50, Interview out of 50. */
  @Column({ name: 'document_score', type: 'numeric', nullable: true })
  documentScore!: string | null;

  @Column({ name: 'interview_score', type: 'numeric', nullable: true })
  interviewScore!: string | null;

  /** Running total out of 100 (document points, plus interview points once
   *  scored) — computed server-side from review_scores. */
  @Column({ name: 'weighted_score', type: 'numeric', nullable: true })
  weightedScore!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
