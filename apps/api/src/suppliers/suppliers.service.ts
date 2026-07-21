import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.supplier.findMany({ orderBy: { name: 'asc' } }));
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
      if (!existing) throw new NotFoundException('المورد غير موجود');
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, id);

      const data: Prisma.SupplierUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber || null;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.category !== undefined) data.category = dto.category || null;

      return tx.supplier.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('المورد غير موجود');
      try {
        await tx.supplier.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — purchases.supplierId is ON DELETE
        // RESTRICT, so this fires when the supplier still has purchases.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException('لا يمكن حذف مورد مرتبط بفواتير شراء — احذف فواتيره أولاً');
        }
        throw e;
      }
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
