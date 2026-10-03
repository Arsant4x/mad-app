import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService, isSensitiveKey } from '../files/files.service';
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
    // ⚖️ ق-١٦٢٥ (توجيه ٢٧٧، بحكم صاحب المشروع: «تُنقل صورُه الجديدة إلى المخزن الحسّاس الآن، والقائمةُ تبقى حيث هي»): صورةُ داخل
    // المسكن تُغلَّف قبل أن تغادر الخادم وتُبثّ عبره بلا رابطٍ موقَّع (`ق-١٣٦٥`)؛ وما رُفع قبلها يبقى في العاديّ ويُقرأ كما هو.
    const stored = await this.files.uploadSensitive(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // 🔴 ق-١٦١٩/ج: «وقفلُ الصفّ بين رفع الصورة والتوقيع» — يُقفل صفُّ النموذج قبل قراءة حاله، فتوقيعٌ في اللحظة نفسِها ينتظر
        // هذا الإدراجَ أو ينتظره هذا: تدخل الصورةُ قبل التوقيع فتُعدّ معه، أو تُردّ بعده؛ ولا تدخل نموذجاً وُقّع بدونها.
        await tx.$queryRaw`SELECT "id" FROM "contract_handovers" WHERE "id" = ${handoverId} FOR UPDATE`;
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
        return created;
      });
    } catch (e) {
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`Could not roll back orphaned upload "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  /** الرابطُ الموقَّع للصورة القائمة في المخزن العاديّ؛ والجديدةُ (الحسّاسة) يرفضها المخزنُ هنا `403` وتُبثّ بـ`download`. */
  downloadUrl(companyId: string, photoId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const photo = await tx.handoverPhoto.findUnique({ where: { id: photoId }, select: { fileKey: true } });
      if (!photo) throw new NotFoundException(MSG.file_not_found);
      return this.files.downloadUrl(companyId, photo.fileKey);
    });
  }

  /**
   * ⚖️ ق-١٦٢٥ — **البثُّ عبر الخادم** لكلِّ صورة: الحسّاسةُ تُفكّ (`readSensitive`)، والقائمةُ في العاديّ تُقرأ كما هي، فالشاشةُ تسلك
   * طريقاً واحداً. والصفُّ يُقرأ تحت سياق المنشأة، فصورةُ غيرها غيرُ موجودة (`404`).
   */
  async download(companyId: string, photoId: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const photo = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.handoverPhoto.findUnique({ where: { id: photoId }, select: { fileKey: true, filename: true, mimeType: true } }),
    );
    if (!photo) throw new NotFoundException(MSG.file_not_found);
    const buffer = isSensitiveKey(photo.fileKey) ? await this.files.readSensitive(companyId, photo.fileKey) : await this.files.readPlain(companyId, photo.fileKey);
    return { buffer, filename: photo.filename, mimeType: photo.mimeType };
  }

  async remove(companyId: string, photoId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const photo = await tx.handoverPhoto.findUnique({ where: { id: photoId }, select: { fileKey: true, handoverId: true } });
      if (!photo) throw new NotFoundException(MSG.file_not_found);
      // 🔴 ق-١٦١٩/ج: قفلُ صفّ النموذج قبل قراءة حاله — فلا تُحذف صورةٌ من نموذجٍ يُوقَّع في اللحظة نفسِها.
      await tx.$queryRaw`SELECT "id" FROM "contract_handovers" WHERE "id" = ${photo.handoverId} FOR UPDATE`;
      const handover = await tx.contractHandover.findUnique({ where: { id: photo.handoverId }, select: { status: true } });
      if (handover?.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
      await tx.handoverPhoto.delete({ where: { id: photoId } });
      return photo.fileKey;
    });
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`Could not delete photo object "${fileKey}": ${e.message}`));
  }
}
