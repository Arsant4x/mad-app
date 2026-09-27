import { Prisma } from '@mad-app/db';
import { round2, roundTo } from '../common/money/rounding';
import { allocationOf, raiseLayerCost, recordCostShares, type CostAllocation, type CostShareNode } from '../purchases/layer-cost-allocation.util';

type Tx = Prisma.TransactionClient;

export interface SettlementRow {
  provisionalId: string;
  settlementId: string;
  qty: number;
  provisionalUnitCost: number;
  actualUnitCost: number;
}

/**
 * ㉘ **كاتبُ تسوية الاستهلاك المؤقّت — الوعدُ الذي كان في الشيفرة بلا كاتب** (`ق-١٠٦٢` · `ق-١٠٦٣/١`).
 *
 * كان `consumeFifo` يعد بأن المؤقّت «يُسوَّى عند وصول الاستلام الحقيقي» ولا كاتبَ للتسوية في الشيفرة كلِّها —
 * فبقي `123` استهلاكاً مؤقّتاً على قاعدة التطوير مفتوحاً أبداً ولا يُرى. وهذا الكاتب: عند وصول طبقةٍ جديدة
 * (استلامُ شراءٍ أو إدخالٌ يدويّ) تُسوّى المؤقّتاتُ المفتوحة على الصنف والمستودع **من الأقدم** — صفٌّ جديد يشير
 * إلى الأصل (`settlesId`) بالطبقة الحقيقية وتكلفتها، ونقصانٌ ذرّيٌّ مشروط من الطبقة (`ق-٨١٤`).
 *
 * ⚠️ **ولا يُسوَّى صفٌّ إلا كاملاً**: `settlesId` فريد، فما لا تكفيه الطبقةُ يبقى مفتوحاً إلى طبقةٍ تكفيه.
 *
 * ## وفرقُ التكلفة على حساب مخرجه (`ق-١٣٦٣` · `ق-١٣٦٤`)
 * (الحقيقية − المؤقّتة) × الكمّية — والمخرجُ الذي أخرج المؤقّتَ يقرّر موضعَه: **البيعُ `5100`** (قائمةُ الدخل كانت تحمل تقديراً)
 * · **الإخراجُ اليدويّ `5810`** (أصلُه قُيّد عليها — وقديمٌ بلا قيد تخرج قيمتُه كلُّها الآن) · **الشطبُ `5800`** (بنصّ المالك:
 * «حصّتُه إلى حساب خسائر الإتلاف لا تكلفة المبيعات») · **والتحويلُ يتبع إلى طبقة المقصِد** التي وُلدت من المؤقّت نفسِه
 * («يتبع الوحدةَ إلى طبقة المقصِد، ولا يُعدّ مستهلكاً») — فترتفع هي، ومخارجُها تُقسَم بالقاعدة نفسِها. ويُسجَّل كلُّ فرقٍ صفّاً
 * في `layer_cost_shares` بحدث `SETTLEMENT` (مادّةُ الحارس الثاني). والمستدعي يقيّد `allocation`.
 *
 * **ولماذا هنا لا في `inventory/costing.util`**: يستدعيه استلامُ الشراء (نواة) والإدخالُ اليدويّ (محرّك)، والنواةُ
 * لا تستورد من المحرّك (`§3` — حارسُ اتجاه الاستيراد)؛ فالكاتبُ في دفتر اليومية حيث يقع أثرُه.
 */
export async function settleProvisionalConsumptions(
  tx: Tx,
  companyId: string,
  args: { productId: string; warehouseId: string; layerId: string },
): Promise<{ settled: number; costDelta: number; allocation: CostAllocation; settlements: SettlementRow[] }> {
  const open = await tx.inventoryConsumption.findMany({
    where: { companyId, layerId: null, settledBy: { is: null }, movement: { productId: args.productId, warehouseId: args.warehouseId } },
    orderBy: { createdAt: 'asc' },
    // مصدرُ المؤقّت يقرّر موضعَ فرقه — ونوعُ حركته يفرز التحويلَ (يحمل MANUAL مصدراً ولا قيدَ له).
    include: { movement: { select: { origin: true, type: true, journalEntryId: true } } },
  });
  const settlements: SettlementRow[] = [];
  const nodes: CostShareNode[] = [];
  let costDelta = 0;
  for (const p of open) {
    const qty = Number(p.qty);
    const layer = await tx.inventoryLayer.findUnique({ where: { id: args.layerId }, select: { qtyReceived: true, qtyRemaining: true, unitCost: true, exitedRaise: true } });
    if (!layer || Number(layer.qtyRemaining) < qty) break;
    const { count } = await tx.inventoryLayer.updateMany({
      where: { id: args.layerId, qtyRemaining: { gte: qty } },
      data: { qtyRemaining: { decrement: qty } },
    });
    if (count === 0) break;
    const actualUnitCost = Number(layer.unitCost);
    const created = await tx.inventoryConsumption.create({
      data: { companyId, layerId: args.layerId, movementId: p.movementId, qty, unitCost: actualUnitCost, settlesId: p.id },
      select: { id: true },
    });
    const provisionalUnitCost = Number(p.unitCost);
    // ⚠️ إخراجٌ يدويٌّ سبق `ق-١٣٦٣` لم يُقيَّد أصلاً (لا قيدَ لحركته): فلا «فرقَ» عن مؤقّتٍ قُيّد — **القيمةُ كلُّها تخرج من الدفتر
    // الآن**، حدثَ اليوم لا تحويلاً للقديم. وما قُيّد (بيعٌ · شطبٌ · يدويٌّ بعد البناء) أو لم يُخرج قيمةً (تحويل) فرقُه وحدَه.
    const transfer = p.movement.type === 'TRANSFER';
    const unpostedManual = !transfer && p.movement.origin === 'MANUAL' && p.movement.journalEntryId === null;
    const delta = round2(unpostedManual ? actualUnitCost * qty : (actualUnitCost - provisionalUnitCost) * qty);
    costDelta += delta;

    const remainingAfter = roundTo(Number(layer.qtyRemaining) - qty, 'DERIVED_QUANTITY');
    const root: CostShareNode = {
      layerId: args.layerId,
      qtyReceived: Number(layer.qtyReceived),
      qtyRemainingAt: remainingAfter,
      baseAmount: delta,
      baseShelf: 0,
      baseCogs: 0,
      baseWriteOff: 0,
      baseVariance: 0,
      baseFollow: 0,
      unitCostBefore: actualUnitCost,
      unitCostAfter: actualUnitCost,
      exitedRaiseBefore: Number(layer.exitedRaise),
      exitedRaiseAfter: Number(layer.exitedRaise),
      children: [],
    };
    if (transfer) {
      const dest = await tx.inventoryLayer.findUnique({ where: { transferConsumptionId: p.id }, select: { id: true } });
      if (dest && delta !== 0) {
        const child = await raiseLayerCost(tx, {
          layerId: dest.id,
          unitsAffected: qty,
          amount: delta,
          onConflict: (id) => new Error(`طبقةُ المقصِد ${id} تغيّرت تحت الأيدي أثناء تسوية مؤقّت التحويل — تُعاد العملية`),
        });
        root.baseFollow = delta;
        root.children.push(child);
      } else root.baseCogs = delta; // تحويلٌ سبق الوصلة (ق-١٣٦٤) — كما كان.
    } else if (p.movement.origin === 'WRITEOFF') root.baseWriteOff = delta;
    else if (p.movement.origin === 'MANUAL') root.baseVariance = delta;
    else root.baseCogs = delta;

    await recordCostShares(tx, companyId, { event: 'SETTLEMENT', settlementId: created.id }, [root]);
    nodes.push(root);
    settlements.push({ provisionalId: p.id, settlementId: created.id, qty, provisionalUnitCost, actualUnitCost });
  }
  return { settled: settlements.length, costDelta: roundTo(costDelta, 'LINE_AMOUNT'), allocation: allocationOf(nodes), settlements };
}
