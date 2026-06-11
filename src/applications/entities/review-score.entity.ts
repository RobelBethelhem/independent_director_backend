import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CriterionId } from '../../common/enums';
import { Application } from './application.entity';
import { User } from '../../users/user.entity';

/** A single reviewer's 1–5 score for one rubric criterion on one application. */
@Entity('review_scores')
@Unique(['applicationId', 'reviewerUserId', 'criterionId'])
export class ReviewScore {
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

  // Stored as varchar (not a PG enum) so the rubric can evolve without enum migrations.
  @Column({ name: 'criterion_id', type: 'varchar' })
  criterionId!: CriterionId;

  @Column({ type: 'int' })
  value!: number; // 1..5
}
