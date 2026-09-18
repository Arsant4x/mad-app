import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { computeStockQuantities, currentStockQty } from './stock-quantity.util';
import { MSG } from '../common/i18n/messages';
import { consumeFifo, createLayerFromMovement, transferLayers } from './costing.util';
import { postCogsSettlementEntry } from '../journal/auto-posting.util';
import { settleProvisionalConsumptions } from '../journal/provisional-settlement.util';

const MOVEMENT_INCLUDE = { product: true, warehouse: true, toWarehouse: true } as const;

export type StockStatus = 'out' | 'low' | 'available';

@Injectable()
export class InventoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  listMovements(companyId: string, allowedBranchIds: string[] | 'all', query: ListMovementsQueryDto = {}) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      const q = query.search?.trim();
      // The search OR is wrapped in AND because branchFilter may itself be an
      // OR (allowed branches ∪ company-wide rows) — a bare spread of two ORs
      // would let the search clause clobber the branch restriction.
      const searchWhere: Prisma.StockMovementWhereInput = q
        ? {
            AND: [
              {
                OR: [
                  { product: { name: { contains: q, mode: 'insensitive' } } },
                  { warehouse: { name: { contains: q, mode: 'insensitive' } } },
                  { toWarehouse: { name: { contains: q, mode: 'insensitive' } } },
                  { reason: { contains: q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {};
      const where: Prisma.StockMovementWhereInput = { ...branchFilter(allowedBranchIds), ...searchWhere };

      // Sequential on purpose: an interactive transaction runs on a single
      // connection, so concurrent queries on `tx` would only race for it.
      const total = await tx.stockMovement.count({ where });
      const items = await tx.stockMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        // ترتيبٌ تامّ لا جزئيّ (`ق-٣٥٦`) — `date` بدقّة اليوم فيتعادل، و`id` يحسم.
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return { items, total, page, pageSize };
    });
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

      // ㉘ القيمةُ تتحرّك مع الكمّية (ق-١٠٦٣): ما يدخل يُنشئ طبقةً بتكلفةٍ **مُدخَلة** — لا من البطاقة،
      // فصفرُها صفرٌ صامت يصير تكلفةَ مبيعاتٍ لاحقاً (ق-١٠٦٣/٣). يُرفض قبل أن يُكتب شيء.
      const entering = dto.type === 'IN' || (dto.type === 'ADJUSTMENT' && dto.qty > 0);
      if (entering && (dto.unitCost === undefined || dto.unitCost === null)) throw new BadRequestException(MSG.unit_cost_required);

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

      // ㉘ طبقةٌ للداخل (وتسويةُ المؤقّت المفتوح بها)، استهلاكٌ للخارج، ونقلُ طبقاتٍ للتحويل — كما الاستلامُ والبيع.
      const when = new Date(dto.date);
      if (entering) {
        const layerId = await createLayerFromMovement(tx, companyId, {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          qty: Math.abs(dto.qty),
          unitCost: dto.unitCost!,
          acquiredAt: when,
          sourceType: 'ADJUSTMENT',
          movementId: movement.id,
        });
        const settled = await settleProvisionalConsumptions(tx, companyId, { productId: dto.productId, warehouseId: dto.warehouseId, layerId });
        if (settled.settled > 0) {
          await postCogsSettlementEntry(tx, companyId, { branchId: movement.branchId, ref: `إدخالٌ يدويّ ${dto.date}`, date: when, baseDelta: settled.costDelta });
        }
      } else if (dto.type === 'OUT' || dto.type === 'ADJUSTMENT') {
        await consumeFifo(tx, companyId, { productId: dto.productId, warehouseId: dto.warehouseId, qty: Math.abs(dto.qty), movementId: movement.id });
      } else if (dto.type === 'TRANSFER') {
        await transferLayers(tx, companyId, {
          productId: dto.productId,
          fromWarehouseId: dto.warehouseId,
          toWarehouseId: dto.toWarehouseId!,
          qty: dto.qty,
          movementId: movement.id,
          date: when,
        });
      }

      // Soft warning only — matches the mockup's non-blocking "quantity
      // exceeds available balance, continue anyway?" confirm: the movement
      // is never rejected for going negative, the frontend just gets enough
      // information to flag it if it wants to.
      const resultingQty = await currentStockQty(tx, dto.productId, dto.warehouseId);
      return { ...movement, resultingQty };
    });
  }

  /**
   * ㉘ الاستهلاكاتُ المؤقّتة **المفتوحة** — التقريرُ الذي وعدت به الشيفرة ولم يقرأه أحد (ق-١٠٦٢): بيعٌ أو إخراجٌ
   * سبق استلامَه فقُيّد بآخر تكلفةٍ معروفة ولم يصله استلامُه بعد. «فما لا يُرى لا يُسوَّى».
   */
  openProvisional(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.inventoryConsumption.findMany({
        where: { layerId: null, settledBy: { is: null }, movement: branchFilter(allowedBranchIds) },
        orderBy: { createdAt: 'asc' },
        include: { movement: { include: { product: { select: { name: true } }, warehouse: { select: { name: true } } } } },
      });
      return rows.map((r) => ({
        id: r.id,
        movementId: r.movementId,
        productId: r.movement.productId,
        productName: r.movement.product.name,
        warehouseId: r.movement.warehouseId,
        warehouseName: r.movement.warehouse.name,
        branchId: r.movement.branchId,
        date: r.movement.date,
        qty: Number(r.qty),
        unitCost: Number(r.unitCost),
        createdAt: r.createdAt,
      }));
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
