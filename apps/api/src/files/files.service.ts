import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { MSG } from '../common/i18n/messages';

/** Download links are short-lived: the URL grants access to whoever holds it,
 * with no further auth check, so it must expire well before it could be
 * shared or logged somewhere lasting. Long enough for a click, not a session. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Deliberately a strict allow-list, not a deny-list: anything not named here
 * is rejected. The four features this layer unblocks (contract attachments,
 * company logo, claim photos, handover forms) only ever need documents and
 * images — nothing here should be able to store an executable or a script. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** MinIO/S3 has no equivalent of Postgres RLS — a key is just a string, and
 * knowing another company's key would be enough to read its file. So every
 * key is namespaced by company, and every read/delete re-derives that prefix
 * from the *verified* tenant context and refuses anything outside it. This
 * function is the single choke point for that rule. */
export function assertKeyBelongsToCompany(key: string, companyId: string): void {
  if (!key.startsWith(companyPrefix(companyId))) {
    throw new ForbiddenException(MSG.file_access_denied);
  }
}

function companyPrefix(companyId: string): string {
  return `companies/${companyId}/`;
}

/** multer/busboy decodes multipart filenames as latin-1 (its `defParamCharset`
 * default), so a UTF-8 name arrives as mojibake — "عقد.pdf" becomes "Ø¹Ù..".
 * Re-reading those bytes as UTF-8 restores the original. This matters here
 * more than in most apps: filenames in this product are usually Arabic. */
function decodeMultipartFilename(filename: string): string {
  return Buffer.from(filename, 'latin1').toString('utf8');
}

/** Strips directory components and anything that isn't a safe filename char,
 * so a crafted name (`../../etc/passwd`, or one with a newline) can't escape
 * its company prefix or corrupt the stored key. */
function sanitizeFilename(filename: string): string {
  const base = decodeMultipartFilename(filename).split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);
  return cleaned || 'file';
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly bucket = process.env.S3_BUCKET ?? 'mad-app-files';
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: 'us-east-1',
    // MinIO serves buckets as a path (localhost:9000/bucket/key), not as a
    // subdomain the way real S3 does — without this the SDK builds URLs that
    // don't resolve locally.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });

  /** Creates the bucket on first boot if it isn't there. Storage being
   * unreachable must not take the whole API down — every other module works
   * fine without it, so this logs and continues instead of throwing. */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created storage bucket "${this.bucket}"`);
      } catch (e) {
        this.logger.warn(`Storage bucket "${this.bucket}" unavailable: ${(e as Error).message}`);
      }
    }
  }

  async upload(companyId: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    if (!file) throw new BadRequestException(MSG.file_missing);
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException(MSG.file_too_large);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(MSG.file_type_unsupported);
    }

    const key = `${companyPrefix(companyId)}${randomUUID()}-${sanitizeFilename(file.originalname)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { key, filename: sanitizeFilename(file.originalname), size: file.size, mimeType: file.mimetype };
  }

  async downloadUrl(companyId: string, key: string): Promise<{ url: string; expiresInSeconds: number }> {
    assertKeyBelongsToCompany(key, companyId);
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  async remove(companyId: string, key: string): Promise<void> {
    assertKeyBelongsToCompany(key, companyId);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
