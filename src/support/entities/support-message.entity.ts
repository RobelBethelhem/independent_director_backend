import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { SupportMessageKind, SupportSender } from '../../common/enums';

/** A single message in a support thread — text, or an image/voice attachment. */
@Entity('support_messages')
@Index(['threadId', 'createdAt'])
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId!: string;

  @Column({ type: 'enum', enum: SupportSender })
  sender!: SupportSender;

  /** The support agent's user id, or the applicant's — null for anonymous users. */
  @Column({ name: 'sender_user_id', type: 'uuid', nullable: true })
  senderUserId!: string | null;

  @Column({ type: 'enum', enum: SupportMessageKind })
  kind!: SupportMessageKind;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  /** Object-storage key for an image/voice attachment (null for text). */
  @Column({ name: 'storage_key', type: 'varchar', nullable: true })
  storageKey!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType!: string | null;

  @Column({ name: 'original_filename', type: 'varchar', nullable: true })
  originalFilename!: string | null;

  /** Voice-note length in milliseconds (null for other kinds). */
  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
