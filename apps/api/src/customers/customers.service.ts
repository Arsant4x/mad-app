import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { assertCustomerNotInTrash } from './customer-trash.util';

/** حقولُ البحث المُعلَنة لهذه القائمة (`ق-١٢٣٦`) — الاسمُ والهاتفُ والرقمُ الضريبي. */
const CUSTOMER_SEARCH_FIELDS = ['name', 'phone', 'vatNumber'] as const;

@Injectable()
export class CustomersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.CustomerWhereInput = { ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), CUSTOMER_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.customer, { where, orderBy: { name: 'asc' } }));
  }

  create(companyId: string, dto: CreateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, undefined, dto.allowSameName === true);
      return tx.customer.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          vatNumber: dto.vatNumber || null,
          phone: dto.phone || null,
          // العنوان الوطني — `''` تعني «فارغ» لا «نصٌّ فارغ»، فالمستند يقرأ
          // `null` غياباً ويقرأ `''` قيمةً حاضرةً خاوية.
          street: dto.street || null,
          buildingNumber: dto.buildingNumber || null,
          district: dto.district || null,
          city: dto.city || null,
          postalCode: dto.postalCode || null,
          creditLimit: dto.creditLimit ?? 0,
        } as unknown as Prisma.CustomerCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, id, dto.allowSameName === true);

      const data: Prisma.CustomerUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber || null;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.street !== undefined) data.street = dto.street || null;
      if (dto.buildingNumber !== undefined) data.buildingNumber = dto.buildingNumber || null;
      if (dto.district !== undefined) data.district = dto.district || null;
      if (dto.city !== undefined) data.city = dto.city || null;
      if (dto.postalCode !== undefined) data.postalCode = dto.postalCode || null;
      if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;

      const updated = await tx.customer.update({ where: { id }, data });
      // **اسمُ العقد وهاتفُه مشتقّان من العميل** (`ق-١٠٢٨`/①⑥): يُحدَّثان في المعاملة نفسِها على كلِّ
      // عقدٍ يحمل معرّفَه — فالعميلُ مصدرُ الحقيقة والحقلُ ذاكرةٌ مشتقّة، لا لقطةٌ تشيخ ولا هجرةٌ تكتبها.
      if (dto.name !== undefined || dto.phone !== undefined) {
        await tx.contract.updateMany({ where: { customerId: id }, data: { tenant: updated.name, phone: updated.phone } });
      }
      return updated;
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      return tx.customer.update({ where: { id }, data: { archived } });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: حذفُ العميل يُمنع بفواتيره في أيّ فرع —
   * فالعميلُ كيانُ منشأة، وفاتورةٌ في فرعٍ لا يراه القارئ تبقى مانعاً لا
   * يُتجاوَز.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      const invoiceCount = await tx.invoice.count({ where: { customerId: id } });
      if (invoiceCount > 0) throw new ConflictException(MSG.customer_has_invoices);
      // والعقودُ كذلك — **بأيّ حالةٍ ولو مُلغاة** (`ق-١٠٢٨`/④): قيودُ الملغى منسوبةٌ إليه، و`Restrict`
      // على `Contract.customer` يجعل محوَه النهائيَّ يفشل بصمت فيبقى في السلة إلى الأبد مربوطاً
      // بعقودٍ لا تراه. والرسالةُ تسمّي المخرج: الأرشفةُ لا الحذف.
      const contractCount = await tx.contract.count({ where: { customerId: id } });
      if (contractCount > 0) throw new ConflictException(MSG.customer_has_contracts);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /**
   * **الرقمُ الضريبي فريدٌ قيداً، والاسمُ فريدٌ تنبيهاً** (`ق-١٠٢٨`/⑤): كانت فرادةُ الاسم قيداً في
   * القاعدة والخدمة لأن العقدَ كان يُنشئ عميلَه بالاسم فيمنع التكرارَ الضمنيّ — وقد زال بالربط
   * الصريح، فبقي ضررُها وحدَه: شخصان حقيقيان بالاسم نفسِه لا يكونان عميلين. فصار الاسمُ المطابق
   * (حيّاً أو في السلة) `409` مسمّىً «أهو نفسُه؟» **حتى يُؤكَّد** بـ`allowSameName`؛ والرقمُ الضريبي
   * يبقى مانعاً — حيّاً كان صاحبُه أو في السلة (`§6.12`: يُقرأ المحذوفُ ناعماً صراحةً).
   * ⛔ ولا تمييزَ بالهاتف — يُشارَك ويتغيّر، مفتاحٌ ضعيفٌ آخر.
   */
  private async assertNoDuplicate(tx: Prisma.TransactionClient, name?: string, vatNumber?: string, excludeId?: string, allowSameName = false): Promise<void> {
    if (!name && !vatNumber) return;
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    if (vatNumber) {
      const live = await tx.customer.findFirst({ where: { vatNumber, ...notSelf }, select: { id: true } });
      if (live) throw new ConflictException('يوجد عميل بنفس الرقم الضريبي بالفعل');
      await assertCustomerNotInTrash(tx, undefined, vatNumber, excludeId);
    }
    if (name && !allowSameName) {
      const live = await tx.customer.findFirst({ where: { name, ...notSelf }, select: { id: true } });
      if (live) throw new ConflictException(MSG.customer_same_name_exists);
      const trashed = await tx.customer.findFirst({ where: { name, deletedAt: { not: null }, ...notSelf }, select: { id: true } });
      if (trashed) throw new ConflictException(MSG.customer_same_name_in_trash);
    }
  }
}
