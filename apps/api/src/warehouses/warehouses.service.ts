import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { computeStockQuantities } from '../inventory/stock-quantity.util';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pageArray } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والموقعُ والمسؤول. */
const WAREHOUSE_SEARCH_FIELDS = ['name', 'location', 'manager'] as const;

@Injectable()
export class WarehousesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الترتيبُ التامّ (`ق-٣٥٦`): الاسمُ ثم `id` — فالقطعُ في الذاكرة يعيد بناءَ القائمة في كل طلب.
      const [warehouses, quantities] = await Promise.all([tx.warehouse.findMany({ ...(includeArchived ? {} : { where: { archived: false } }), orderBy: [{ name: 'asc' }, { id: 'asc' }] }), computeStockQuantities(tx)]);

      const rows = warehouses.map((w) => {
        let itemCount = 0;
        let totalQty = 0;
        for (const [key, qty] of quantities) {
          if (!key.endsWith(`|${w.id}`) || qty === 0) continue;
          itemCount += 1;
          totalQty += qty;
        }
        return { ...w, itemCount, totalQty };
      });
      // القائمةُ محسوبةٌ (أرصدةٌ لكل مستودع) فتُقطَع في الذاكرة بعد الحساب.
      return pageArray(query, rows, WAREHOUSE_SEARCH_FIELDS);
    });
  }

  create(companyId: string, dto: CreateWarehouseDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.warehouse.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: { name: dto.name, location: dto.location, manager: dto.manager } as unknown as Prisma.WarehouseCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateWarehouseDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.warehouse_not_found);

      const data: Prisma.WarehouseUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.location !== undefined) data.location = dto.location;
      if (dto.manager !== undefined) data.manager = dto.manager;

      return tx.warehouse.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.warehouse_not_found);
      return tx.warehouse.update({ where: { id }, data: { archived } });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: حذفُ المستودع يُمنع بحركاته كلِّها في
   * الاتجاهين — والحركةُ تُنسب إلى مستودعٍ لا إلى فرع القارئ، ومستودعٌ استقبل
   * بضاعةً من فرعٍ محجوبٍ ليس فارغاً.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.warehouse_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      // Both directions count — a warehouse that only ever *received* stock
      // still has history worth keeping.
      const movementCount = await tx.stockMovement.count({ where: { OR: [{ warehouseId: id }, { toWarehouseId: id }] } });
      if (movementCount > 0) throw new ConflictException(MSG.warehouse_has_movements);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.warehouse.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
