import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A recommender's invitation for a candidate to apply (referral with a tracked link). */
@Entity('recommendations')
@Index(['recommenderUserId'])
@Index(['applicantUserId'])
export class Recommendation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recommender_user_id', type: 'uuid' })
  recommenderUserId!: string;

  /** Snapshot so the candidate / reviewers always see who recommended them. */
  @Column({ name: 'recommender_name', type: 'varchar' })
  recommenderName!: string;

  @Column({ name: 'recommender_email', type: 'varchar', nullable: true })
  recommenderEmail!: string | null;

  @Column({ name: 'candidate_name', type: 'varchar' })
  candidateName!: string;

  @Column({ name: 'candidate_email', type: 'varchar' })
  candidateEmail!: string;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  token!: string;

  @Column({ name: 'cycle_id', type: 'uuid', nullable: true })
  cycleId!: string | null;

  /** First time the invite link was opened. */
  @Column({ name: 'clicked_at', type: 'timestamptz', nullable: true })
  clickedAt!: Date | null;

  /** The applicant account created via this link (the traceability link). */
  @Column({ name: 'applicant_user_id', type: 'uuid', nullable: true })
  applicantUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
