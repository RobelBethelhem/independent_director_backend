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

  @Column({ type: 'boolean', default: false })
  submitted!: boolean;

  /** Computed server-side from review_scores: round(Σ value/5 × weight). */
  @Column({ name: 'weighted_score', type: 'numeric', nullable: true })
  weightedScore!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
