import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { computeStockQuantities, currentStockQty } from './stock-quantity.util';
import { MSG } from '../common/i18n/messages';
import { closeLayerExactly, consumeFifo, createLayerFromMovement, restoreConsumption, transferLayers } from './costing.util';
import { postCogsSettlementEntry } from '../journal/auto-posting.util';
import { settleProvisionalConsumptions } from '../journal/provisional-settlement.util';
import { BATCH_FEFO_DECLARED_LIMITS } from '../common/batches/declared-limits';
import { resolveReceiptBatch, toDateOnly } from '../common/batches/stock-batch.util';
import { roundTo } from '../common/money/rounding';

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

      // ٥+٦ الدفعةُ تُحلّ كياناً **قبل** الكتابة (`ق-١٠٨٦`): لصنفٍ معلَنٍ تتبّعُه بلا دفعة، أو لرقمٍ قائمٍ بانتهاءٍ آخر،
      // يُردّ الطلبُ مسمًّى ولا يُكتب شيء — فالحكمُ فيهما للمالك (الموجز `§٤/٣` و`§٤/٤`).
      const batchId = entering
        ? await resolveReceiptBatch(tx, companyId, {
            productId: dto.productId,
            expiryTracked: product.expiryTracked,
            batchNo: dto.batchNo,
            expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          })
        : null;

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
          // نصُّ الدفعة على الحركة الداخلة كما كان يُقرأ في القائمة — والكيانُ على الطبقة (`batchId`)؛ ولا يُختم
          // خروجٌ بدفعة: البيعُ لا يعيد وسمَ ما يسحبه.
          batchNo: batchId ? dto.batchNo?.trim() : undefined,
          expiryDate: batchId && dto.expiryDate ? new Date(dto.expiryDate) : undefined,
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
          batchId,
        });
        const settled = await settleProvisionalConsumptions(tx, companyId, { productId: dto.productId, warehouseId: dto.warehouseId, layerId });
        if (settled.settled > 0) {
          await postCogsSettlementEntry(tx, companyId, { branchId: movement.branchId, ref: `إدخالٌ يدويّ ${dto.date}`, date: when, baseDelta: settled.costDelta });
        }
      } else if (dto.type === 'OUT' || dto.type === 'ADJUSTMENT') {
        // ٥+٦ الإخراجُ اليدويّ ليس بيعاً — المنتهي يمرّ منه (`ق-١٠٨٢`).
        await consumeFifo(tx, companyId, { productId: dto.productId, warehouseId: dto.warehouseId, qty: Math.abs(dto.qty), movementId: movement.id, exit: 'OTHER', date: when });
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
   * ٥+٦ **قربُ الانتهاء بالمتبقّي لا بالمستلَم** (`ق-١٠٨٠` · `ق-١٠٨٦`): كان التقريرُ يقرأ حركاتِ الإدخال بالكمّية
   * الواردة — «فصيدليةٌ باعت شحنةً كاملةً ما زالت ترى «سينتهي قريباً»». الآن الصفُّ دفعةٌ في مستودع بما بقي في
   * طبقاتها (`qtyRemaining > 0`)؛ وما بيع أو شُطب لا يظهر.
   *
   * **والحركاتُ القديمة بدفعةٍ نصّاً** (`96` على التطوير يومَ البناء — الموجز `§٤/٥` ينتظر الحكم) **تبقى وتُعدّ ولا
   * تُخمَّن**: تُدرَج صفوفاً مسمّاةً `LEGACY_MOVEMENT` بكمّيتها **الواردة** لا المتبقّية — والقارئ يقرأ نوعَ الكمّية من
   * `qtyKind`. **على مستوى المنشأة بحقّها**: الطبقاتُ لا تحمل فرعاً، فتُرشَّح بفرع حركة مصدرها.
   *
   * ويُردّ مع الصفوف **الحدودُ الثلاثة المعلَنة** (`ق-١٠٨٥`) — فمن يستعمل التقرير يقرأ حدَّه.
   */
  /**
   * ٥+٦ **الرصيدُ بالدفعة** (`ق-١٠٩٩` — بنصّ المالك: «فبلا معرفة المتبقّي لكلِّ دفعة، لا يُقرأ `FEFO` ولا قربُ الانتهاء
   * ⇒ وهو تتمّةُ ما بُني لا بابٌ جديد»): لكلِّ (صنفٍ · مستودعٍ · دفعة) المتبقّي من طبقاتها (`Σ qtyRemaining`) مع الانتهاء
   * وما بقي من مهلته؛ **وما لا دفعةَ له صفٌّ مسمًّى** بالمتبقّي كذلك — يُعدّ ولا تُخمَّن دفعتُه (`ق-١٠٧٦`/٣). يُقرأ من
   * الطبقات وحدَها لا من الحركات، فما بيع أو شُطب لا يظهر. الترتيبُ كترتيب الصرف تحت `FEFO`: الأقربُ انتهاءً أوّلاً،
   * وما لا دفعةَ له أخيراً (`ق-١١٠٢`). **على مستوى المنشأة بحقّها**: الطبقاتُ لا تحمل فرعاً، فتُرشَّح بفرع حركة مصدرها.
   * ويُردّ مع الصفوف الحدودُ المعلَنة (`ق-١٠٨٥`).
   */
  batchBalances(companyId: string, allowedBranchIds: string[] | 'all', productId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const today = toDateOnly(new Date());
      const layers = await tx.inventoryLayer.findMany({
        where: {
          qtyRemaining: { gt: 0 },
          ...(productId ? { productId } : {}),
          ...(allowedBranchIds === 'all' ? {} : { sourceMovement: branchFilter(allowedBranchIds) }),
        },
        include: {
          batch: { select: { id: true, batchNo: true, expiryDate: true } },
          product: { select: { id: true, name: true, sku: true, expiryTracked: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      type Row = {
        id: string;
        productId: string;
        productName: string;
        sku: string | null;
        expiryTracked: boolean | null;
        warehouseId: string;
        warehouseName: string;
        batchId: string | null;
        batchNo: string | null;
        expiryDate: string | null;
        daysLeft: number | null;
        expired: boolean;
        qty: number;
        layers: number;
      };
      const grouped = new Map<string, Row>();
      for (const l of layers) {
        const key = `${l.product.id}|${l.warehouseId}|${l.batch?.id ?? 'none'}`;
        const daysLeft = l.batch ? Math.round((toDateOnly(l.batch.expiryDate).getTime() - today.getTime()) / 86400000) : null;
        const row =
          grouped.get(key) ??
          {
            id: key,
            productId: l.product.id,
            productName: l.product.name,
            sku: l.product.sku,
            expiryTracked: l.product.expiryTracked,
            warehouseId: l.warehouseId,
            warehouseName: l.warehouse.name,
            batchId: l.batch?.id ?? null,
            batchNo: l.batch?.batchNo ?? null,
            expiryDate: l.batch ? l.batch.expiryDate.toISOString().slice(0, 10) : null,
            daysLeft,
            expired: daysLeft !== null && daysLeft < 0,
            qty: 0,
            layers: 0,
          };
        row.qty = roundTo(row.qty + Number(l.qtyRemaining), 'DERIVED_QUANTITY');
        row.layers += 1;
        grouped.set(key, row);
      }
      const rows = [...grouped.values()].sort((a, b) => {
        const byName = a.productName.localeCompare(b.productName) || a.warehouseName.localeCompare(b.warehouseName);
        if (byName !== 0) return byName;
        if (a.expiryDate === null && b.expiryDate === null) return 0;
        if (a.expiryDate === null) return 1;
        if (b.expiryDate === null) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
      const noBatchRows = rows.filter((r) => r.batchId === null).length;
      return { rows, noBatchRows, declaredLimits: BATCH_FEFO_DECLARED_LIMITS };
    });
  }

  expiringStock(companyId: string, allowedBranchIds: string[] | 'all', withinDays = 90) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const today = toDateOnly(new Date());
      const horizon = new Date(today);
      horizon.setUTCDate(horizon.getUTCDate() + withinDays);
      const daysLeftOf = (expiry: Date) => Math.round((toDateOnly(expiry).getTime() - today.getTime()) / 86400000);

      const layers = await tx.inventoryLayer.findMany({
        where: {
          batchId: { not: null },
          qtyRemaining: { gt: 0 },
          batch: { expiryDate: { lte: horizon } },
          // القارئُ المقصورُ على فروعٍ يرى طبقاتِ حركاتِ فروعه (أو بلا فرع) — و«الكلّ» بلا مرشِّحٍ على العلاقة أصلاً.
          ...(allowedBranchIds === 'all' ? {} : { sourceMovement: branchFilter(allowedBranchIds) }),
        },
        include: {
          batch: { select: { id: true, batchNo: true, expiryDate: true } },
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      const grouped = new Map<string, { batchId: string; productId: string; productName: string; sku: string | null; warehouseId: string; warehouseName: string; batchNo: string; expiryDate: Date; qty: number }>();
      for (const l of layers) {
        const b = l.batch!;
        const key = `${b.id}|${l.warehouseId}`;
        const row = grouped.get(key) ?? { batchId: b.id, productId: l.product.id, productName: l.product.name, sku: l.product.sku, warehouseId: l.warehouseId, warehouseName: l.warehouse.name, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: 0 };
        row.qty += Number(l.qtyRemaining);
        grouped.set(key, row);
      }
      const batchRows = [...grouped.values()].map((r) => {
        const daysLeft = daysLeftOf(r.expiryDate);
        return {
          id: `${r.batchId}|${r.warehouseId}`,
          source: 'BATCH' as const,
          productId: r.productId,
          productName: r.productName,
          sku: r.sku,
          warehouseName: r.warehouseName,
          batchNo: r.batchNo as string | null,
          qty: r.qty,
          qtyKind: 'REMAINING' as const,
          expiryDate: r.expiryDate.toISOString().slice(0, 10),
          daysLeft,
          expired: daysLeft < 0,
        };
      });

      // ما سبق البناء: حركةُ إدخالٍ بنصّ دفعةٍ ولا طبقةَ لها بدفعة — تبقى نصّاً وتُعدّ.
      const legacy = await tx.stockMovement.findMany({
        where: { ...branchFilter(allowedBranchIds), type: 'IN', expiryDate: { not: null, lte: horizon }, layers: { none: { batchId: { not: null } } } },
        include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
      });
      const legacyRows = legacy.map((m) => {
        const expiry = m.expiryDate as Date;
        const daysLeft = daysLeftOf(expiry);
        return {
          id: m.id,
          source: 'LEGACY_MOVEMENT' as const,
          productId: m.product.id,
          productName: m.product.name,
          sku: m.product.sku,
          warehouseName: m.warehouse.name,
          batchNo: m.batchNo,
          qty: Number(m.qty),
          qtyKind: 'RECEIVED' as const,
          expiryDate: expiry.toISOString().slice(0, 10),
          daysLeft,
          expired: daysLeft < 0,
        };
      });

      const rows = [...batchRows, ...legacyRows].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.productName.localeCompare(b.productName));
      return { rows, declaredLimits: BATCH_FEFO_DECLARED_LIMITS };
    });
  }

  /**
   * ㉙ **عكسُ الحركة بحركةٍ مقابلة — لا حذف** (`ق-١٠٦٣`): تاريخُ المخزون لا يُمحى؛ الحركةُ الخاطئة تُعكَس بحركةٍ
   * تشير إليها وتبقى الاثنتان. ولا يُعكَس ما له مستند (بيعٌ · استلامٌ · شطب) إلا من مستنده، ولا ما استُهلكت
   * طبقتُه (فالتاريخُ الذي بُني عليه لا يُعاد)، ولا تُعكَس الحركةُ مرّتين، ولا يُعكَس العكس.
   *   - إخراجٌ ⟵ إدخالٌ مقابل يعيد الاستهلاكَ إلى طبقاته الأصلية (`restoreConsumption`) — لا طبقةً جديدة.
   *   - إدخالٌ ⟵ إخراجٌ يُقفل طبقتَه هو بعينها (`closeLayerExactly`).
   *   - تحويلٌ ⟵ تحويلٌ مقابل: طبقاتُ المقصِد تُقفل والمصدرُ يستعيد طبقاتِه بتاريخها.
   * ولا قيدَ في الدفتر — كما لم يكن للحركة اليدوية قيد (قراءةٌ معلَنة في ㉘).
   */
  reverse(companyId: string, allowedBranchIds: string[] | 'all', id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await tx.stockMovement.findFirst({ where: { id, ...branchFilter(allowedBranchIds) }, include: { reversedBy: { select: { id: true } } } });
      if (!original) throw new NotFoundException(MSG.movement_not_found);
      if (original.reversalOfId) throw new ConflictException(MSG.movement_is_reversal);
      if (original.reversedBy) throw new ConflictException(MSG.movement_already_reversed);
      if (original.origin !== 'MANUAL') throw new ConflictException(MSG.movement_has_document);

      const signedQty = Number(original.qty);
      const qty = Math.abs(signedQty);
      const entering = original.type === 'IN' || (original.type === 'ADJUSTMENT' && signedQty > 0);
      const reason = `عكسُ الحركة ${original.id.slice(0, 8)}${original.reason ? ` — ${original.reason}` : ''}`;
      const base = { companyId, branchId: original.branchId, productId: original.productId, date: new Date(), reason, origin: 'MANUAL' as const, reversalOfId: original.id };

      if (entering) {
        const layers = await tx.inventoryLayer.findMany({ where: { sourceMovementId: original.id } });
        if (layers.some((l) => Number(l.qtyRemaining) !== Number(l.qtyReceived))) throw new ConflictException(MSG.movement_layer_consumed);
        const reversal = await tx.stockMovement.create({ data: { ...base, warehouseId: original.warehouseId, type: 'OUT', qty }, include: MOVEMENT_INCLUDE });
        for (const l of layers) await closeLayerExactly(tx, companyId, { layerId: l.id, movementId: reversal.id });
        return { ...reversal, resultingQty: await currentStockQty(tx, original.productId, original.warehouseId) };
      }

      if (original.type === 'OUT' || original.type === 'ADJUSTMENT') {
        await restoreConsumption(tx, companyId, original.id);
        const reversal = await tx.stockMovement.create({ data: { ...base, warehouseId: original.warehouseId, type: 'IN', qty }, include: MOVEMENT_INCLUDE });
        return { ...reversal, resultingQty: await currentStockQty(tx, original.productId, original.warehouseId) };
      }

      // TRANSFER: طبقاتُ المقصِد التي أنشأها التحويل تُقفل، والمصدرُ يستعيد ما استُهلك منه.
      const dest = await tx.inventoryLayer.findMany({ where: { sourceMovementId: original.id, warehouseId: original.toWarehouseId! } });
      if (dest.some((l) => Number(l.qtyRemaining) !== Number(l.qtyReceived))) throw new ConflictException(MSG.movement_layer_consumed);
      const reversal = await tx.stockMovement.create({
        data: { ...base, warehouseId: original.toWarehouseId!, toWarehouseId: original.warehouseId, type: 'TRANSFER', qty },
        include: MOVEMENT_INCLUDE,
      });
      for (const l of dest) await closeLayerExactly(tx, companyId, { layerId: l.id, movementId: reversal.id });
      await restoreConsumption(tx, companyId, original.id);
      return { ...reversal, resultingQty: await currentStockQty(tx, original.productId, original.toWarehouseId!) };
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
