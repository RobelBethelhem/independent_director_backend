import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationDocument } from '../entities/document.entity';

/**
 * Virus-scanning stub. In production this enqueues the object for an async scan
 * (ClamAV / a queue worker) and the file stays quarantined (scanned_clean=false)
 * until it passes. For local dev we mark it clean immediately so the submit flow
 * is exercisable end-to-end.
 */
@Injectable()
export class DocumentScanService {
  private readonly logger = new Logger(DocumentScanService.name);

  constructor(
    @InjectRepository(ApplicationDocument)
    private readonly docs: Repository<ApplicationDocument>,
  ) {}

  async enqueue(documentId: string): Promise<void> {
    // TODO(prod): publish to a scan queue; worker sets scanned_clean on a clean result.
    this.logger.log(`[scan] document=${documentId} -> clean (dev stub)`);
    await this.docs.update({ id: documentId }, { scannedClean: true });
  }
}
