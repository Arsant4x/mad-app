import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.supplier.findMany({ ...{ orderBy: { name: 'asc' } }, ...(includeArchived ? {} : { where: { archived: false } }) }));
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
