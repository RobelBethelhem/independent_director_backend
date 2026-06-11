import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocType } from '../../common/enums';
import { Application } from './application.entity';

/**
 * Uploaded supporting document. The file itself lives in private object storage;
 * we only persist metadata + the storage key. Served via short-lived signed URLs.
 */
@Entity('documents')
@Index(['applicationId'])
export class ApplicationDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => Application, (a) => a.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: Application;

  @Column({ name: 'doc_type', type: 'enum', enum: DocType })
  docType!: DocType;

  @Column({ name: 'original_filename', type: 'varchar' })
  originalFilename!: string;

  @Column({ name: 'storage_key', type: 'varchar' })
  storageKey!: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  /** False until the background virus scan clears the file. */
  @Column({ name: 'scanned_clean', type: 'boolean', default: false })
  scannedClean!: boolean;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt!: Date;
}
