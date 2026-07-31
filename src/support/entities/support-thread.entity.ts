import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { SupportSender } from '../../common/enums';

/**
 * One support conversation. Tied either to a signed-in applicant (`userId`) or to
 * an anonymous visitor by an unguessable browser-generated id (`anonId`) — the
 * latter behaves like a magic link: whoever holds the id can see the thread.
 */
@Entity('support_threads')
export class SupportThread {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId!: string | null;

  @Column({ name: 'anon_id', type: 'varchar', nullable: true })
  @Index()
  anonId!: string | null;

  /** Human label shown to support — the applicant's email, or "Guest". */
  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName!: string | null;

  @Column({ type: 'boolean', default: false })
  closed!: boolean;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  @Index()
  lastMessageAt!: Date | null;

  /** Who sent the most recent message — lets the console flag threads awaiting a reply. */
  @Column({ name: 'last_message_by', type: 'enum', enum: SupportSender, nullable: true })
  lastMessageBy!: SupportSender | null;

  @Column({ name: 'last_message_preview', type: 'varchar', nullable: true })
  lastMessagePreview!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
