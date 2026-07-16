import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3-compatible private object storage (MinIO in dev, S3 in prod). Files are never
 * served directly — clients upload via a presigned PUT and download via a short-lived
 * presigned GET. Ensures the bucket exists and has CORS for the SPA at startup.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  /** Container-to-container only (bucket setup, delete) — never handed to the browser. */
  private readonly client: S3Client;
  /** Used ONLY to sign URLs the browser fetches directly (upload/download/preview) —
   *  must point somewhere the browser can actually resolve, see configuration.ts. */
  private readonly publicClient: S3Client;
  private readonly bucket: string;
  private readonly frontendOrigin: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('storage.bucket');
    this.frontendOrigin = config.getOrThrow<string>('frontendOrigin');
    const shared = {
      region: config.getOrThrow<string>('storage.region'),
      forcePathStyle: config.getOrThrow<boolean>('storage.forcePathStyle'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('storage.accessKey'),
        secretAccessKey: config.getOrThrow<string>('storage.secretKey'),
      },
      // The SDK defaults to WHEN_SUPPORTED, which adds a CRC32 checksum to
      // PutObject. That breaks PRESIGNED uploads: at signing time there is no
      // body, so it bakes the checksum of an EMPTY payload into the URL
      // (x-amz-checksum-crc32=AAAAAA==). The browser then PUTs the real file,
      // whose checksum differs, and a strict S3 implementation (recent MinIO)
      // rejects it. Only checksum when the operation actually requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ endpoint: config.getOrThrow<string>('storage.endpoint'), ...shared });
    this.publicClient = new S3Client({ endpoint: config.getOrThrow<string>('storage.publicEndpoint'), ...shared });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      // Don't crash the API if storage is down; document features will error until it's up.
      this.logger.warn(`Storage init skipped: ${(err as Error).message}`);
    }
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket ${this.bucket}`);
    }
    // Allow the SPA to PUT (upload) and GET (download) directly via presigned URLs.
    // MinIO permits cross-origin requests from any origin by default and returns
    // NotImplemented for PutBucketCors, so this is best-effort (real S3 honors it).
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedMethods: ['PUT', 'GET'],
                AllowedOrigins: [this.frontendOrigin],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      );
    } catch {
      this.logger.debug('Skipped PutBucketCors (not supported by this storage backend)');
    }
  }

  /** Presigned URL the client PUTs the file bytes to (default 10 min). */
  presignUpload(key: string, contentType: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  /**
   * Short-lived presigned download URL (default 2 min). `inline` makes the browser
   * display the file (image/PDF preview) instead of downloading it.
   */
  presignDownload(key: string, filename?: string, expiresIn = 120, inline = false): Promise<string> {
    const disposition = filename ? this.buildDisposition(filename, inline) : undefined;
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn },
    );
  }

  /** RFC 6266 / 5987 Content-Disposition. Quotes and control chars are stripped
   *  from the ASCII fallback (defense against header injection via a crafted
   *  filename) and the full name is percent-encoded in `filename*`. */
  private buildDisposition(filename: string, inline: boolean): string {
    const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_');
    const encoded = encodeURIComponent(filename);
    return `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
  }

  /** Actual stored object metadata — used to verify a just-uploaded object's
   *  real size/content-type against the client's declared values (a presigned
   *  PUT can't itself cap size, so we enforce it after the fact). */
  async headObject(key: string): Promise<{ size: number; contentType?: string }> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
