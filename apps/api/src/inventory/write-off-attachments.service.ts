import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchFilter } from '../branches/branch-scope.util';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';

const ATTACHMENT_SELECT = {
  id: true,
  writeOffId: true,
  filename: true,
  size: true,
  mimeType: true,
  uploadedAt: true,
} as const;

/**
 * ⭐ **مرفقات واقعة الشطب — الدليل الذي تطلبه الهيئة إن سألت** (`SPEC 30.5`).
 *
 * `م٤٩(٥)` تجعل **القيد في السجلات كافياً وللهيئة طلب أدلة**. فالمرفق ليس
 * زينةً: صورة البضاعة · محضر الإتلاف · **تقرير الشرطة في السرقة** — وهو من
 * الأدلة المسمّاة. ومن شطب بلا دليلٍ محفوظ **يملك قيداً ولا يملك ما يسنده**.
 *
 * والبنية نفسها التي في `PurchaseAttachmentsService`: البايتات في تخزين
 * الكائنات، **والصفّ المنطاق بالمستأجر هو سجلّ التصريح**، وكل دالةٍ تعمل في
 * سياق المنشأة فتحرس `RLS` الجارَ ولو خُمِّن المعرّف.
 *
 * ⚠️ **والمرفق يُقبل على واقعةٍ محسومة أيضاً** — عمداً: محضر الإتلاف يصل بعد
 * الاعتماد غالباً، ورفضُه كان يعني **دليلاً يُفقد لأن ترتيب وصوله لم يوافق
 * ترتيب شاشتنا**. والواقعة نفسها لا تتغيّر بإضافة دليلها.
 */
@Injectable()
export class WriteOffAttachmentsService {
  private readonly logger = new Logger(WriteOffAttachmentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', writeOffId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.writeOffOrThrow(tx, allowedBranchIds, writeOffId);
      return tx.inventoryWriteOffAttachment.findMany({ where: { writeOffId }, select: ATTACHMENT_SELECT, orderBy: { uploadedAt: 'desc' } });
    });
  }

  async add(companyId: string, allowedBranchIds: string[] | 'all', writeOffId: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // الرفع أولاً: قائمة الأنواع المسموحة وحدّ الحجم وتسمية المفتاح كلها في
    // `FilesService` — فملفٌ مرفوض **لا يبلغ القاعدة أصلاً**.
    const stored = await this.files.upload(companyId, file);
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await this.writeOffOrThrow(tx, allowedBranchIds, writeOffId);
        return tx.inventoryWriteOffAttachment.create({
          // `companyId` يحقنه امتداد المستأجر لكل صفّ.
          data: { writeOffId, fileKey: stored.key, filename: stored.filename, size: stored.size, mimeType: stored.mimeType } as unknown as Prisma.InventoryWriteOffAttachmentUncheckedCreateInput,
          select: ATTACHMENT_SELECT,
        });
      });
    } catch (e) {
      // ملفٌ رُفع ثم فشل صفّه **يبقى يتيماً في التخزين** — لا يشير إليه شيء
      // ولا يُحذف بحذف شيء. فيُحذف هنا، والفشل يُعلَن ولا يُبتلع.
      await this.files.remove(companyId, stored.key).catch((err: Error) => this.logger.warn(`تعذّر حذف مرفقٍ يتيم "${stored.key}": ${err.message}`));
      throw e;
    }
  }

  downloadUrl(companyId: string, allowedBranchIds: string[] | 'all', attachmentId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await this.attachmentOrThrow(tx, allowedBranchIds, attachmentId);
      return this.files.downloadUrl(companyId, att.fileKey);
    });
  }

  async remove(companyId: string, allowedBranchIds: string[] | 'all', attachmentId: string): Promise<void> {
    const fileKey = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const att = await this.attachmentOrThrow(tx, allowedBranchIds, attachmentId);
      await tx.inventoryWriteOffAttachment.delete({ where: { id: attachmentId } });
      return att.fileKey;
    });
    await this.files.remove(companyId, fileKey).catch((e: Error) => this.logger.warn(`تعذّر حذف كائن المرفق "${fileKey}": ${e.message}`));
  }

  /** الواقعة موجودةٌ في هذه المنشأة **وفي فروع القارئ** — **يُفحص قبل أي كتابة**، فمعرّفٌ مخمَّن
   * لجارٍ لا يجد صفّاً هنا (وRLS تحرسه ثانيةً). */
  private async writeOffOrThrow(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', writeOffId: string) {
    // ق-١٤٤٠: واقعةُ فرعٍ خارج فروعه لا وجودَ لها عنده — `404` لا `403`، فلا تُسرد مرفقاتُها ولا يُزرع فيها دليل.
    const row = await tx.inventoryWriteOff.findFirst({ where: { id: writeOffId, ...branchFilter(allowedBranchIds) }, select: { id: true } });
    if (!row) throw new NotFoundException(MSG.writeoff_not_found);
    return row;
  }

  /** المرفقُ بواقعته على فروع القارئ — **قبل الرابط والحذف**؛ والواقعةُ بلا فرعٍ (على المنشأة) يراها الجميع. */
  private async attachmentOrThrow(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', attachmentId: string) {
    // ق-١٤٤٠: مرفقُ واقعةٍ خارج فروعه لا وجودَ له عنده — `404` لا `403`، فلا يُنزَّل دليلُ فرعٍ آخر ولا يُحذف.
    const att = await tx.inventoryWriteOffAttachment.findFirst({
      where: { id: attachmentId, ...(allowedBranchIds === 'all' ? {} : { writeOff: branchFilter(allowedBranchIds) }) },
      select: { fileKey: true },
    });
    if (!att) throw new NotFoundException(MSG.file_not_found);
    return att;
  }
}
