import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MessageChannel, MessageTemplate } from '../../common/enums';
import { Application } from './application.entity';
import { User } from '../../users/user.entity';

/** A message sent to an applicant (acknowledgement, info request, interview invite, etc.). */
@Entity('messages')
@Index(['applicationId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ name: 'from_user_id', type: 'uuid', nullable: true })
  fromUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser!: User | null;

  @Column({ type: 'enum', enum: MessageChannel, default: MessageChannel.Email })
  channel!: MessageChannel;

  @Column({ type: 'enum', enum: MessageTemplate, default: MessageTemplate.Blank })
  template!: MessageTemplate;

  @Column({ type: 'varchar', nullable: true })
  subject!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
