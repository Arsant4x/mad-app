import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { computeStockQuantities, currentStockQty } from './stock-quantity.util';
import { MSG } from '../common/i18n/messages';

const MOVEMENT_INCLUDE = { product: true, warehouse: true, toWarehouse: true } as const;

export type StockStatus = 'out' | 'low' | 'available';

@Injectable()
export class InventoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  listMovements(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.findMany({ where: branchFilter(allowedBranchIds), include: MOVEMENT_INCLUDE, orderBy: { date: 'desc' } }),
    );
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateStockMovementDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (!product) throw new NotFoundException(MSG.product_not_found);
      const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException(MSG.warehouse_not_found);

      if (dto.type === 'TRANSFER') {
        if (!dto.toWarehouseId) throw new BadRequestException(MSG.destination_warehouse_required);
        if (dto.toWarehouseId === dto.warehouseId) throw new BadRequestException(MSG.destination_same_as_source);
        const toWarehouse = await tx.warehouse.findUnique({ where: { id: dto.toWarehouseId } });
        if (!toWarehouse) throw new NotFoundException(MSG.destination_warehouse_not_found);
      }

      if (dto.type === 'ADJUSTMENT') {
        if (dto.qty === 0) throw new BadRequestException(MSG.adjustment_cannot_be_zero);
      } else if (dto.qty <= 0) {
        throw new BadRequestException(MSG.quantity_must_be_positive);
      }

      const movement = await tx.stockMovement.create({
        data: {
          branchId: await resolveBranchId(tx, dto.branchId, allowedBranchIds),
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          toWarehouseId: dto.type === 'TRANSFER' ? dto.toWarehouseId : undefined,
          type: dto.type,
          qty: dto.type === 'ADJUSTMENT' ? dto.qty : Math.abs(dto.qty),
          date: new Date(dto.date),
          reason: dto.reason,
          // Batch/expiry are meaningful on receiving stock; ignored on OUT so a
          // sale never re-stamps a batch it's drawing down.
          batchNo: dto.type === 'IN' ? dto.batchNo : undefined,
          expiryDate: dto.type === 'IN' && dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        } as unknown as Prisma.StockMovementUncheckedCreateInput,
        include: MOVEMENT_INCLUDE,
      });

      // Soft warning only — matches the mockup's non-blocking "quantity
      // exceeds available balance, continue anyway?" confirm: the movement
      // is never rejected for going negative, the frontend just gets enough
      // information to flag it if it wants to.
      const resultingQty = await currentStockQty(tx, dto.productId, dto.warehouseId);
      return { ...movement, resultingQty };
    });
  }

  /**
   * Batches approaching expiry (or already past it), for the perishable side of
   * inventory — pharmacies above all.
   *
   * Reads receiving (IN) movements that carry an expiry within the horizon. It
   * reports the batch as **received**, not the live remaining quantity of that
   * exact batch — per-batch depletion (FEFO) is a larger feature — so `qty` is
   * what came in. Still the actionable list: what to pull or discount before it
   * lapses. Ordered soonest-first; already-expired ones come first (negative
   * `daysLeft`).
   */
  expiringStock(companyId: string, allowedBranchIds: string[] | 'all', withinDays = 90) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + withinDays);

      const rows = await tx.stockMovement.findMany({
        where: { ...branchFilter(allowedBranchIds), type: 'IN', expiryDate: { not: null, lte: horizon } },
        include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
      });

      return rows.map((m) => {
        const expiry = m.expiryDate as Date;
        const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
        return {
          id: m.id,
          productName: m.product.name,
          sku: m.product.sku,
          warehouseName: m.warehouse.name,
          batchNo: m.batchNo,
          qty: Number(m.qty),
          expiryDate: expiry.toISOString().slice(0, 10),
          daysLeft,
          expired: daysLeft < 0,
        };
      });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.stockMovement.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.movement_not_found);
      await tx.stockMovement.delete({ where: { id } });
    });
  }

  stockLevels(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const [quantities, products, warehouses] = await Promise.all([
        computeStockQuantities(tx),
        tx.product.findMany(),
        tx.warehouse.findMany(),
      ]);
      const productById = new Map(products.map((p) => [p.id, p]));
      const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

      const rows: { productId: string; warehouseId: string; product: (typeof products)[number]; warehouse: (typeof warehouses)[number]; qty: number; status: StockStatus }[] = [];
      for (const [key, qty] of quantities) {
        if (qty === 0) continue;
        const [productId, warehouseId] = key.split('|');
        const product = productById.get(productId);
        const warehouse = warehouseById.get(warehouseId);
        if (!product || !warehouse) continue;

        const min = Number(product.minStock);
        const status: StockStatus = qty <= 0 ? 'out' : min > 0 && qty <= min ? 'low' : 'available';
        rows.push({ productId, warehouseId, product, warehouse, qty, status });
      }

      return rows.sort((a, b) => a.product.name.localeCompare(b.product.name));
    });
  }
}
