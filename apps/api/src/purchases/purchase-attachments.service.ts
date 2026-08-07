import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';
import { MSG } from '../common/i18n/messages';

const ATTACHMENT_SELECT = {
  id: true,
  purchaseId: true,
  filename: true,
  size: true,
  mimeType: true,
  uploadedAt: true,
} as const;

/**
 * مستند §5: فاتورة المصروف (التأسيسي وغيره) ومستندها — صورة أو PDF.
 *
 * Same shape as ContractAttachmentsService: bytes in object storage, the
 * tenant-scoped row is the authorization record, and every method runs in the
 * purchase's own tenant context so RLS keeps neighbours out even by guessed id.
 */
@Injectable()
export class PurchaseAttachmentsService {
  private readonly logger = new Logger(PurchaseAttachmentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, purchaseId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, select: { id: true } });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      return tx.purchaseAttachment.findMany({ where: { purchaseId }, select: ATTACHMENT_SELECT, orderBy: { uploadedAt: 'desc' } });
    });
  }

  async add(companyId: string, purchaseId: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // Upload first: MIME allow-list, size cap and key namespacing live in
    // FilesService, so a rejected file never reaches the database.
    const stored = await this.files.upload(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, select: { id: true } });
        if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
        return tx.purchaseAttachment.create({
          // companyId omitted on purpose — injected per-row by the tenant
          // scope extension.
          data: { purchaseId, fileKey: stored.key, filename: stored.filename, size: stored.size, mimeType: stored.mimeType } as unknown as Prisma.PurchaseAttachmentUncheckedCreateInput,
          select: ATTACHMENT_SELECT,
        });
      });
    } catch (e) {
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`Could not roll back orphaned upload "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  downloadUrl(companyId: string, attachmentId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.purchaseAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      return this.files.downloadUrl(companyId, att.fileKey);
    });
  }

  async remove(companyId: string, attachmentId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.purchaseAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      await tx.purchaseAttachment.delete({ where: { id: attachmentId } });
      return att.fileKey;
    });
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`Could not delete attachment object "${fileKey}": ${e.message}`));
  }
}
