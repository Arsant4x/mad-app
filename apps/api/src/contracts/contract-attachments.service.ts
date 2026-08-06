import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';
import { MSG } from '../common/i18n/messages';

/** What the API returns for one attachment — never the raw storage key alone,
 * since a key is only useful through a signed download URL fetched on demand. */
const ATTACHMENT_SELECT = {
  id: true,
  contractId: true,
  filename: true,
  size: true,
  mimeType: true,
  uploadedAt: true,
} as const;

/**
 * Files attached to a lease — the signed PDF, an ID scan, an annex.
 *
 * The bytes live in object storage; this keeps the tenant-scoped metadata row
 * and is the single place that authorizes access. Every method runs inside the
 * contract's own tenant context, so RLS guarantees one company can never list,
 * download, or delete another's attachment even by guessing an id.
 */
@Injectable()
export class ContractAttachmentsService {
  private readonly logger = new Logger(ContractAttachmentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, contractId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // A contract that isn't this company's is invisible under RLS, so this
      // both proves it exists and that the caller owns it.
      const contract = await tx.contract.findUnique({ where: { id: contractId }, select: { id: true } });
      if (!contract) throw new NotFoundException(MSG.contract_not_found);
      return tx.contractAttachment.findMany({ where: { contractId }, select: ATTACHMENT_SELECT, orderBy: { uploadedAt: 'desc' } });
    });
  }

  async add(companyId: string, contractId: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // Upload first: the MIME allow-list, size cap and key-namespacing all live in
    // FilesService, so a rejected file never reaches the database.
    const stored = await this.files.upload(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId }, select: { id: true } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);
        return tx.contractAttachment.create({
          // companyId omitted on purpose — injected per-row by the tenant scope
          // extension (see accounts.service.ts for why this cast exists). Every
          // other required column is passed explicitly, so the cast hides
          // nothing but the injected tenant id.
          data: { contractId, fileKey: stored.key, filename: stored.filename, size: stored.size, mimeType: stored.mimeType } as unknown as Prisma.ContractAttachmentUncheckedCreateInput,
          select: ATTACHMENT_SELECT,
        });
      });
    } catch (e) {
      // The row didn't get written (bad contract id, or a race). Don't leave the
      // uploaded object orphaned in storage.
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`Could not roll back orphaned upload "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  downloadUrl(companyId: string, attachmentId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.contractAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      // downloadUrl re-derives the company prefix from the key, so even a key
      // that somehow slipped tenant scope can't be signed for another company.
      return this.files.downloadUrl(companyId, att.fileKey);
    });
  }

  async remove(companyId: string, attachmentId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await tx.contractAttachment.findUnique({ where: { id: attachmentId }, select: { fileKey: true } });
      if (!att) throw new NotFoundException(MSG.file_not_found);
      await tx.contractAttachment.delete({ where: { id: attachmentId } });
      return att.fileKey;
    });
    // Row is gone; clear the object too. A failure here only orphans bytes, so
    // it's logged rather than surfaced as an error to the user.
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`Could not delete attachment object "${fileKey}": ${e.message}`));
  }
}
