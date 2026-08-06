import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { computeStockQuantities } from '../inventory/stock-quantity.util';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class WarehousesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const [warehouses, quantities] = await Promise.all([tx.warehouse.findMany({ orderBy: { name: 'asc' } }), computeStockQuantities(tx)]);

      return warehouses.map((w) => {
        let itemCount = 0;
        let totalQty = 0;
        for (const [key, qty] of quantities) {
          if (!key.endsWith(`|${w.id}`) || qty === 0) continue;
          itemCount += 1;
          totalQty += qty;
        }
        return { ...w, itemCount, totalQty };
      });
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

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.warehouse_not_found);
      try {
        await tx.warehouse.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — stock_movements.warehouseId/
        // toWarehouseId are ON DELETE RESTRICT, so this fires when the
        // warehouse still has any movement history (in either direction).
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(MSG.warehouse_has_movements);
        }
        throw e;
      }
    });
  }
}
