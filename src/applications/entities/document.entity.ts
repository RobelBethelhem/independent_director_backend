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

  /**
   * Soft link to the education / employment entry this file supports (a per-degree
   * certificate or a per-position work letter). Plain nullable UUID columns — NOT a
   * foreign key — because the entries are saved with PUT-replace (delete + reinsert
   * with the same client-supplied id), and a FK with cascade would wipe the file on
   * every save. Null for standalone documents (CV, ID, TIN, photo, …).
   */
  @Column({ name: 'education_entry_id', type: 'uuid', nullable: true })
  @Index()
  educationEntryId!: string | null;

  @Column({ name: 'employment_entry_id', type: 'uuid', nullable: true })
  @Index()
  employmentEntryId!: string | null;

  @Column({ name: 'professional_entry_id', type: 'uuid', nullable: true })
  @Index()
  professionalEntryId!: string | null;

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
