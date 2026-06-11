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
import { ALLOWED_MIME_TYPES, MAX_DOC_SIZE_BYTES } from './document.constants';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(ApplicationDocument)
    private readonly docs: Repository<ApplicationDocument>,
    private readonly applications: ApplicationsService,
    private readonly storage: StorageService,
    private readonly scan: DocumentScanService,
  ) {}

  private validateUpload(mime: string, size: number): void {
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      throw new BadRequestException('Unsupported file type. Upload a PDF or image (PNG, JPEG, WebP).');
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
    this.validateUpload(dto.mime, dto.size);
    const storageKey = `applications/${appId}/${dto.docType}/${randomUUID()}-${this.sanitize(dto.filename)}`;
    const uploadUrl = await this.storage.presignUpload(storageKey, dto.mime);
    return { uploadUrl, storageKey };
  }

  /** Step 2: after the client PUTs the bytes, record metadata and queue the scan. */
  async record(userId: string, appId: string, dto: RecordDocumentDto): Promise<ApplicationDocument> {
    await this.applications.assertOwnedEditable(userId, appId);
    this.validateUpload(dto.mimeType, dto.sizeBytes);
    if (!dto.storageKey.startsWith(`applications/${appId}/`)) {
      throw new BadRequestException('storageKey does not belong to this application');
    }
    const doc = this.docs.create({
      applicationId: appId,
      docType: dto.docType,
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
