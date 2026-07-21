import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { computeStockQuantities, currentStockQty } from './stock-quantity.util';

const MOVEMENT_INCLUDE = { product: true, warehouse: true, toWarehouse: true } as const;

export type StockStatus = 'out' | 'low' | 'available';

@Injectable()
export class InventoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  listMovements(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.findMany({ include: MOVEMENT_INCLUDE, orderBy: { date: 'desc' } }),
    );
  }

  create(companyId: string, dto: CreateStockMovementDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (!product) throw new NotFoundException('المنتج غير موجود');
      const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException('المستودع غير موجود');

      if (dto.type === 'TRANSFER') {
        if (!dto.toWarehouseId) throw new BadRequestException('الرجاء اختيار المستودع الوجهة');
        if (dto.toWarehouseId === dto.warehouseId) throw new BadRequestException('لا يمكن التحويل لنفس المستودع');
        const toWarehouse = await tx.warehouse.findUnique({ where: { id: dto.toWarehouseId } });
        if (!toWarehouse) throw new NotFoundException('المستودع الوجهة غير موجود');
      }

      if (dto.type === 'ADJUSTMENT') {
        if (dto.qty === 0) throw new BadRequestException('قيمة التسوية يجب ألا تساوي صفراً');
      } else if (dto.qty <= 0) {
        throw new BadRequestException('الكمية يجب أن تكون أكبر من صفر');
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          toWarehouseId: dto.type === 'TRANSFER' ? dto.toWarehouseId : undefined,
          type: dto.type,
          qty: dto.type === 'ADJUSTMENT' ? dto.qty : Math.abs(dto.qty),
          date: new Date(dto.date),
          reason: dto.reason,
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

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.stockMovement.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الحركة غير موجودة');
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
