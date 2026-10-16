import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { isUnitCode } from '../common/units/units';
import { validateDeclaredTax } from '../common/vat/line-tax.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والرمزُ والباركودُ والفئة. */
const PRODUCT_SEARCH_FIELDS = ['name', 'sku', 'barcode', 'category'] as const;

/** Matches the original mockup's genBarcode(): a 12-digit, EAN-13-shaped
 * numeric string derived from the current timestamp. Not guaranteed globally
 * unique (same as the mockup) — good enough for a picklist barcode, not a
 * real inventory system. */
function generateBarcode(): string {
  return '2' + Date.now().toString().slice(-11);
}

@Injectable()
export class ProductsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.ProductWhereInput = { ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), PRODUCT_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.product, { where, orderBy: { name: 'asc' } }));
  }

  create(companyId: string, dto: CreateProductDto) {
    // ① الوحدةُ تُعلَن ولا تُفترض: صنفٌ جديد بلا رمزٍ من القائمة يُرفض باسمه — لا «قطعة» صامتة.
    if (dto.unitCode === undefined || dto.unitCode === null || dto.unitCode === '') throw new BadRequestException(MSG.unit_code_required);
    if (!isUnitCode(dto.unitCode)) throw new BadRequestException(MSG.unit_code_unknown);
    // ٥+٦ التتبّعُ بالدفعة والانتهاء يُعلَن (نعم أو لا) ولا يُخمَّن — كالوحدة (`ق-١٠٨١` · `ق-١٠٧٦`/١).
    if (typeof dto.expiryTracked !== 'boolean') throw new BadRequestException(MSG.expiry_tracked_required);
    // ⑧ فئةُ الضريبة تُعلَن عند الإنشاء ولا تُخمَّن — والسببُ من قائمة الهيئة بقواعدها (`ق-١٢١١` · `ق-١٢٢٢`).
    const tax = validateDeclaredTax(dto);
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.product.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          sku: dto.sku || null,
          category: dto.category || null,
          unitCode: dto.unitCode,
          expiryTracked: dto.expiryTracked,
          ...tax,
          price: dto.price ?? 0,
          cost: dto.cost ?? 0,
          minStock: dto.minStock ?? 0,
          barcode: dto.barcode || generateBarcode(),
        } as unknown as Prisma.ProductCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateProductDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.product_not_found);

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.sku !== undefined) data.sku = dto.sku || null;
      if (dto.category !== undefined) data.category = dto.category || null;
      // إعلانُ الوحدة للقائم يمرّ من هنا — رمزٌ من القائمة أو رفضٌ مسمًّى؛ ولا يُمحى إعلانٌ قائم.
      if (dto.unitCode !== undefined) {
        if (!isUnitCode(dto.unitCode)) throw new BadRequestException(MSG.unit_code_unknown);
        data.unitCode = dto.unitCode;
      }
      // ٥+٦ إعلانُ التتبّع للقائم يمرّ من هنا عند لمس الصنف (`ق-١٠٨٣`) — نعم أو لا؛ ولا يُمحى إعلانٌ قائم.
      if (dto.expiryTracked !== undefined) data.expiryTracked = dto.expiryTracked;
      // ⑧ إعلانُ الفئة للقائم (`LEGACY_STANDARD` ⟵ فئةٌ معلَنة) أو تغييرُها — الثلاثةُ تُفحص معاً على ما سيصير
      // عليه الصنفُ لا على الجزء المرسَل: تغييرُ الفئة وحدَها مع سببٍ قائم من فئةٍ أخرى مخالفةٌ لا نسيان.
      // ولا يُعاد صنفٌ إلى القيمة القديمة (الـDTO لا يقبلها). وإعادةُ التصنيف لا تمسّ مستنداً صادراً —
      // السطورُ نسخت فئتَها لحظةَ البيع.
      if (dto.taxCategory !== undefined || dto.taxExemptionReasonCode !== undefined || dto.taxExemptionReason !== undefined) {
        const merged = validateDeclaredTax({
          taxCategory: dto.taxCategory ?? (existing.taxCategory === 'LEGACY_STANDARD' ? null : existing.taxCategory),
          taxExemptionReasonCode: dto.taxExemptionReasonCode !== undefined ? dto.taxExemptionReasonCode : existing.taxExemptionReasonCode,
          taxExemptionReason: dto.taxExemptionReason !== undefined ? dto.taxExemptionReason : existing.taxExemptionReason,
        });
        data.taxCategory = merged.taxCategory;
        data.taxExemptionReasonCode = merged.taxExemptionReasonCode;
        data.taxExemptionReason = merged.taxExemptionReason;
      }
      if (dto.price !== undefined) data.price = dto.price;
      if (dto.cost !== undefined) data.cost = dto.cost;
      if (dto.minStock !== undefined) data.minStock = dto.minStock;
      if (dto.barcode !== undefined) data.barcode = dto.barcode || existing.barcode;

      return tx.product.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.product_not_found);
      return tx.product.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.product_not_found);
      // Stock still on a cost layer stays in the books; deleting the product would drop it from every stock screen.
      const openLayer = await tx.inventoryLayer.findFirst({ where: { productId: id, qtyRemaining: { gt: 0 } }, select: { id: true } });
      if (openLayer) throw new ConflictException(MSG.product_has_open_stock);
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
