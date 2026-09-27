import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { outstandingAfterNotes } from '../common/adjustment/adjustment-note.util';
import { money } from '../common/money/text';
import { allocatedByDocument } from '../common/settlement/settlement.util';
import { dayEndOf } from '../common/wall-clock.util';
import { creditedByPurchase, purchaseTarget } from '../purchases/purchase-settlement.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والهاتفُ والرقمُ الضريبي والفئة. */
const SUPPLIER_SEARCH_FIELDS = ['name', 'phone', 'vatNumber', 'category'] as const;

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.SupplierWhereInput = { ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), SUPPLIER_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.supplier, { where, orderBy: { name: 'asc' } }));
  }

  /**
   * ملخّصُ المورّد في فترة — ثلاثةُ أرقامٍ كانت تُجمع في نافذة تفاصيله (`ق-١٢٤٣`): **المفوتَر** موقَّعاً
   * بنوع المستند (الإشعارُ الدائن ينقص)، **والمسدَّد** من تخصيصات سندات الصرف على مستندات الفترة
   * (`ق-٨٧٢`)، **والمستحقّ** متبقّي كلِّ مستندٍ بعد ما ائتمن به المورّد — من المصدر الواحد
   * (`outstandingAfterNotes`) لا من طرحٍ في الشاشة؛ والمُلغى بقيد عكسٍ لا ذمّةَ عليه (`ق-٩٩٧`/②).
   * الفترةُ على تاريخ المستند كما كانت الشاشةُ ترشّح؛ وكلُّها نصٌّ بخانتين.
   *
   * **على مستوى المنشأة بحقّها**: مستنداتُ المورّد تُقرأ من فروعها كلِّها — فما يُطالِب به المورّدُ
   * دَينٌ على المنشأة، والتقريرُ يقابله كاملاً كما تقابله فواتيرُه المفتوحة عند السداد.
   */
  summary(companyId: string, id: string, range: { from?: string; to?: string }) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id }, select: { id: true } });
      if (!supplier) throw new NotFoundException(MSG.supplier_not_found);
      const date: Prisma.DateTimeFilter = {};
      if (range.from) date.gte = new Date(range.from);
      if (range.to) date.lte = dayEndOf(new Date(range.to));
      const purchases = await tx.purchase.findMany({
        where: { supplierId: id, ...(Object.keys(date).length ? { date } : {}) },
        select: { id: true, docType: true, total: true, voidedAt: true },
      });
      const ids = purchases.map((p) => p.id);
      const allocated = await allocatedByDocument(purchaseTarget(tx), ids);
      const credited = await creditedByPurchase(tx, ids);
      let billed = 0;
      let paid = 0;
      let due = 0;
      for (const p of purchases) {
        billed += (p.docType === 'SUPPLIER_CREDIT_NOTE' ? -1 : 1) * Number(p.total);
        const alloc = allocated.get(p.id) ?? 0;
        paid += alloc;
        const creditedTotal = p.docType === 'SUPPLIER_CREDIT_NOTE' ? 0 : (credited.get(p.id) ?? 0);
        due += p.voidedAt ? 0 : outstandingAfterNotes(p, creditedTotal, alloc, 'SUPPLIER_CREDIT_NOTE');
      }
      return { supplierId: id, from: range.from ?? null, to: range.to ?? null, billed: money(billed), paid: money(paid), due: money(due) };
    });
  }

  create(companyId: string, dto: CreateSupplierDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber);
      return tx.supplier.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          vatNumber: dto.vatNumber || null,
          phone: dto.phone || null,
          category: dto.category || null,
        } as unknown as Prisma.SupplierCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateSupplierDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.supplier_not_found);
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, id);

      const data: Prisma.SupplierUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber || null;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.category !== undefined) data.category = dto.category || null;

      return tx.supplier.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.supplier_not_found);
      return tx.supplier.update({ where: { id }, data: { archived } });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: حذفُ المورّد يُمنع بمشترياته في أيّ فرع —
   * فالمورّدُ كيانُ منشأة، وشراءٌ في فرعٍ محجوبٍ عن القارئ يبقى مانعاً.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.supplier_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      const purchaseCount = await tx.purchase.count({ where: { supplierId: id } });
      if (purchaseCount > 0) throw new ConflictException(MSG.supplier_has_purchases);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /** Mirrors the mockup's duplicate-name/duplicate-VAT check in createSupplier(). */
  private async assertNoDuplicate(tx: Prisma.TransactionClient, name?: string, vatNumber?: string, excludeId?: string): Promise<void> {
    if (!name && !vatNumber) return;
    const or: Prisma.SupplierWhereInput[] = [];
    if (name) or.push({ name });
    if (vatNumber) or.push({ vatNumber });

    const existing = await tx.supplier.findFirst({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(existing.name === name ? `يوجد مورد بنفس الاسم "${name}" بالفعل` : 'يوجد مورد بنفس الرقم الضريبي بالفعل');
    }
  }
}
