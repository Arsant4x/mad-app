import { Prisma } from '@prisma/client';
import { roundTo } from '../common/money/rounding';

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
 * ويُعاد فرقُ التكلفة (الحقيقية − المؤقّتة) × الكمّية ليرحّله المستدعي على `5100`/`1300` — فقائمةُ الدخل
 * كانت تحمل تقديراً، والتسويةُ تجعله رقماً.
 *
 * **ولماذا هنا لا في `inventory/costing.util`**: يستدعيه استلامُ الشراء (نواة) والإدخالُ اليدويّ (محرّك)، والنواةُ
 * لا تستورد من المحرّك (`§3` — حارسُ اتجاه الاستيراد)؛ فالكاتبُ في دفتر اليومية حيث يقع أثرُه.
 */
export async function settleProvisionalConsumptions(
  tx: Tx,
  companyId: string,
  args: { productId: string; warehouseId: string; layerId: string },
): Promise<{ settled: number; costDelta: number; settlements: SettlementRow[] }> {
  const open = await tx.inventoryConsumption.findMany({
    where: { companyId, layerId: null, settledBy: { is: null }, movement: { productId: args.productId, warehouseId: args.warehouseId } },
    orderBy: { createdAt: 'asc' },
  });
  const settlements: SettlementRow[] = [];
  let costDelta = 0;
  for (const p of open) {
    const qty = Number(p.qty);
    const layer = await tx.inventoryLayer.findUnique({ where: { id: args.layerId }, select: { qtyRemaining: true, unitCost: true } });
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
    costDelta += (actualUnitCost - provisionalUnitCost) * qty;
    settlements.push({ provisionalId: p.id, settlementId: created.id, qty, provisionalUnitCost, actualUnitCost });
  }
  return { settled: settlements.length, costDelta: roundTo(costDelta, 'LINE_AMOUNT'), settlements };
}
