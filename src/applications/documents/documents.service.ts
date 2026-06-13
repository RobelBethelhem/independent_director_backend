import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ApplicationDocument } from '../entities/document.entity';
import { ApplicationsService } from '../applications.service';
import { StorageService } from '../../storage/storage.service';
import { DocumentScanService } from './document-scan.service';
import { PresignDto, RecordDocumentDto } from './documents.dto';
import { allowedMimesFor, MAX_DOC_SIZE_BYTES } from './document.constants';
import { DocType } from '../../common/enums';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(ApplicationDocument)
    private readonly docs: Repository<ApplicationDocument>,
    private readonly applications: ApplicationsService,
    private readonly storage: StorageService,
    private readonly scan: DocumentScanService,
  ) {}

  private validateUpload(mime: string, size: number, docType: DocType): void {
    if (!allowedMimesFor(docType).includes(mime)) {
      throw new BadRequestException(
        docType === DocType.Photo
          ? 'Unsupported file type. Upload an image (PNG, JPEG or WebP).'
          : 'Unsupported file type. Upload a PDF.',
      );
    }
    if (size > MAX_DOC_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB limit.');
    }
  }

  private sanitize(filename: string): string {
    return filename.replace(/[^\w.\-]+/g, '_').slice(-120);
  }

  /** Step 1 of upload: validate, mint a storage key, return a presigned PUT URL. */
  async presign(userId: string, appId: string, dto: PresignDto) {
    await this.applications.assertOwnedEditable(userId, appId);
    this.validateUpload(dto.mime, dto.size, dto.docType);
    const storageKey = `applications/${appId}/${dto.docType}/${randomUUID()}-${this.sanitize(dto.filename)}`;
    const uploadUrl = await this.storage.presignUpload(storageKey, dto.mime);
    return { uploadUrl, storageKey };
  }

  /** Step 2: after the client PUTs the bytes, record metadata and queue the scan. */
  async record(userId: string, appId: string, dto: RecordDocumentDto): Promise<ApplicationDocument> {
    await this.applications.assertOwnedEditable(userId, appId);
    this.validateUpload(dto.mimeType, dto.sizeBytes, dto.docType);
    if (!dto.storageKey.startsWith(`applications/${appId}/`)) {
      throw new BadRequestException('storageKey does not belong to this application');
    }
    // Single-file slots: one profile photo per application, and one certificate /
    // work letter per entry. Replace any previous file in that slot so re-uploading
    // doesn't pile up duplicates.
    await this.replacePriorInSlot(appId, dto);
    const doc = this.docs.create({
      applicationId: appId,
      docType: dto.docType,
      educationEntryId: dto.educationEntryId ?? null,
      employmentEntryId: dto.employmentEntryId ?? null,
      originalFilename: dto.originalFilename,
      storageKey: dto.storageKey,
      mimeType: dto.mimeType,
      sizeBytes: String(dto.sizeBytes),
      scannedClean: false,
    });
    const saved = await this.docs.save(doc);
    await this.scan.enqueue(saved.id);
    return (await this.docs.findOne({ where: { id: saved.id } }))!;
  }

  /** Remove the existing file occupying a single-file slot (photo / per-entry doc). */
  private async replacePriorInSlot(appId: string, dto: RecordDocumentDto): Promise<void> {
    let where: Record<string, unknown> | null = null;
    if (dto.docType === DocType.Photo) {
      where = { applicationId: appId, docType: DocType.Photo };
    } else if (dto.educationEntryId) {
      where = { applicationId: appId, docType: DocType.Edu, educationEntryId: dto.educationEntryId };
    } else if (dto.employmentEntryId) {
      where = { applicationId: appId, docType: DocType.Work, employmentEntryId: dto.employmentEntryId };
    }
    if (!where) return;
    const prior = await this.docs.find({ where });
    for (const d of prior) {
      await this.storage.delete(d.storageKey).catch(() => undefined);
    }
    if (prior.length) {
      await this.docs.delete(prior.map((d) => d.id));
    }
  }

  async list(userId: string, appId: string): Promise<ApplicationDocument[]> {
    await this.applications.assertOwnedDocReadable(userId, appId);
    return this.docs.find({ where: { applicationId: appId }, order: { uploadedAt: 'ASC' } });
  }

  async remove(userId: string, appId: string, docId: string): Promise<{ ok: true }> {
    await this.applications.assertOwnedEditable(userId, appId);
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: appId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    await this.storage.delete(doc.storageKey).catch(() => undefined);
    await this.docs.delete({ id: docId });
    return { ok: true };
  }

  async downloadUrl(userId: string, appId: string, docId: string): Promise<{ url: string }> {
    await this.applications.assertOwnedDocReadable(userId, appId);
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: appId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const url = await this.storage.presignDownload(doc.storageKey, doc.originalFilename);
    return { url };
  }

  /** Inline URL (for in-app preview) plus the metadata the viewer needs. */
  async previewUrl(
    userId: string,
    appId: string,
    docId: string,
  ): Promise<{ url: string; mimeType: string; filename: string }> {
    await this.applications.assertOwnedDocReadable(userId, appId);
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: appId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const url = await this.storage.presignDownload(doc.storageKey, doc.originalFilename, 300, true);
    return { url, mimeType: doc.mimeType, filename: doc.originalFilename };
  }
}
