import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DeclarationAnswer, DeclarationItemId } from '../../common/enums';
import { Application } from './application.entity';

@Entity('declarations')
@Unique(['applicationId', 'itemId'])
export class Declaration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.declarations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ name: 'item_id', type: 'enum', enum: DeclarationItemId })
  itemId!: DeclarationItemId;

  @Column({ type: 'enum', enum: DeclarationAnswer })
  answer!: DeclarationAnswer;

  /** Required when answer = yes (every current item flags on "yes"). */
  @Column({ type: 'text', nullable: true })
  explanation!: string | null;
}
