import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';
import { MSG } from '../common/i18n/messages';

const ATTACHMENT_SELECT = {
  id: true,
  claimId: true,
  filename: true,
  size: true,
  mimeType: true,
  uploadedAt: true,
} as const;

/**
 * مرفقات المطالبة (§16 + احتياجات §11): فاتورة الإصلاح، صور الضرر، المراسلات.
 *
 * Mirror of ContractAttachmentsService — bytes in object storage, tenant-scoped
 * metadata here, every method inside the claim's own tenant context so RLS
 * makes a neighbour's claim (and its files) unreachable even by guessed id.
 */
@Injectable()
export class ClaimAttachmentsService {
  private readonly logger = new Logger(ClaimAttachmentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, claimId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const claim = await tx.contractClaim.findUnique({ where: { id: claimId }, select: { id: true } });
      if (!claim) throw new NotFoundException(MSG.claim_not_found);
      return tx.claimAttachment.findMany({ where: { claimId }, select: ATTACHMENT_SELECT, orderBy: { uploadedAt: 'desc' } });
    });
  }

  async add(companyId: string, claimId: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // Upload first: allow-list, size cap and key-namespacing live in
    // FilesService, so a rejected file never reaches the database.
    const stored = await this.files.upload(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const claim = await tx.contractClaim.findUnique({ where: { id: claimId }, select: { id: true } });
        if (!claim) throw new NotFoundException(MSG.claim_not_found);
        return tx.claimAttachment.create({
          // companyId omitted on purpose — injected by the tenant-scope extension.
          data: { claimId, fileKey: stored.key, filename: stored.filename, size: stored.size, mimeType: stored.mimeType } as unknown as Prisma.ClaimAttachmentUncheckedCreateInput,
          select: ATTACHMENT_SELECT,
        });
      });
    } catch (e) {
      // Row not written — don't leave the object orphaned in storage.
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`Could not roll back orphaned upload "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  downloadUrl(companyId: string, attachmentId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.claimAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      return this.files.downloadUrl(companyId, att.fileKey);
    });
  }

  async remove(companyId: string, attachmentId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.claimAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      await tx.claimAttachment.delete({ where: { id: attachmentId } });
      return att.fileKey;
    });
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`Could not delete attachment object "${fileKey}": ${e.message}`));
  }
}
