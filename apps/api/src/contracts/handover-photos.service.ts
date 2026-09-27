import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';
import { MSG } from '../common/i18n/messages';

const PHOTO_SELECT = {
  id: true,
  handoverId: true,
  itemId: true,
  filename: true,
  size: true,
  mimeType: true,
  note: true,
  uploadedAt: true,
} as const;

/**
 * صور نموذج الاستلام/التسليم (16.15): على النموذج كله أو على بندٍ بعينه
 * (خدشُ البابِ صورتُه على بند الباب).
 *
 * القاعدة الحاكمة: الصور **جزء مما وُقِّع عليه** — بعد التوقيع لا تُضاف صورة
 * ولا تُحذف، بنفس صرامة بنود النموذج نفسها (handover_signed_immutable).
 * العرض والتنزيل يبقيان مفتوحين دائماً.
 */
@Injectable()
export class HandoverPhotosService {
  private readonly logger = new Logger(HandoverPhotosService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, handoverId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await tx.contractHandover.findUnique({ where: { id: handoverId }, select: { id: true } });
      if (!handover) throw new NotFoundException(MSG.handover_not_found);
      return tx.handoverPhoto.findMany({ where: { handoverId }, select: PHOTO_SELECT, orderBy: { uploadedAt: 'asc' } });
    });
  }

  async add(
    companyId: string,
    handoverId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    opts: { itemId?: string; note?: string },
  ) {
    const stored = await this.files.upload(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const handover = await tx.contractHandover.findUnique({ where: { id: handoverId }, select: { id: true, status: true } });
        if (!handover) throw new NotFoundException(MSG.handover_not_found);
        // ما وُقِّع قُفِل — إضافة صورة بعد التوقيع تزوير للنموذج.
        if (handover.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);

        if (opts.itemId) {
          const item = await tx.handoverItem.findFirst({ where: { id: opts.itemId, handoverId }, select: { id: true } });
          if (!item) throw new NotFoundException(MSG.handover_item_not_found);
        }

        const created = await tx.handoverPhoto.create({
          // companyId omitted on purpose — injected by the tenant-scope extension.
          data: {
            handoverId,
            itemId: opts.itemId ?? null,
            fileKey: stored.key,
            filename: stored.filename,
            size: stored.size,
            mimeType: stored.mimeType,
            note: opts.note,
          } as unknown as Prisma.HandoverPhotoUncheckedCreateInput,
          select: PHOTO_SELECT,
        });
        // سدّ سباق التوقيع المتزامن: لو وُقِّع النموذج بين فحصنا والإدراج،
        // قراءةٌ ثانية داخل نفس المعاملة تراه فنتراجع كلياً (rollback).
        const still = await tx.contractHandover.findUnique({ where: { id: handoverId }, select: { status: true } });
        if (still?.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
        return created;
      });
    } catch (e) {
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`Could not roll back orphaned upload "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  downloadUrl(companyId: string, photoId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const photo = await tx.handoverPhoto.findUnique({ where: { id: photoId }, select: { fileKey: true } });
      if (!photo) throw new NotFoundException(MSG.file_not_found);
      return this.files.downloadUrl(companyId, photo.fileKey);
    });
  }

  async remove(companyId: string, photoId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const photo = await tx.handoverPhoto.findUnique({ where: { id: photoId }, select: { fileKey: true, handoverId: true, handover: { select: { status: true } } } });
      if (!photo) throw new NotFoundException(MSG.file_not_found);
      if (photo.handover.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
      await tx.handoverPhoto.delete({ where: { id: photoId } });
      // سدّ سباق التوقيع المتزامن: لو وُقِّع بين فحصنا والحذف، قراءةٌ ثانية
      // داخل نفس المعاملة تراه فيتراجع الحذف كلياً وتبقى الصورة.
      const still = await tx.contractHandover.findUnique({ where: { id: photo.handoverId }, select: { status: true } });
      if (still?.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
      return photo.fileKey;
    });
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`Could not delete photo object "${fileKey}": ${e.message}`));
  }
}
