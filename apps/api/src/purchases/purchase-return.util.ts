import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { roundTo } from '../common/money/rounding';
import { spreadCostOverLayer } from './layer-cost-spread.util';

/**
 * ⚖️ **أثرُ إشعار المورّد على الرفّ — على طبقة الاستلام الأصلية نفسِها** (`ق-١٠٠٦`/③ · `ق-٩٩٠`).
 *
 * مرآةُ `returnStockedLines` مقلوبةً: هناك يعود المبيعُ **إلى** طبقته الأصلية، وهنا تخرج المُعادةُ
 * **من** طبقة استلامها — الطبقةُ نفسُها لا طبقةٌ جديدة ولا FIFO، **بحدّ ما على الرفّ** (ما استُهلك
 * لا يُعاد). والخروجُ **استهلاكٌ مسجَّلٌ صفّاً** (`InventoryConsumption` على الطبقة بحركته) — فتبقى
 * معادلةُ الطبقة صادقة (`ق-٨١٧`) ويُدقَّق ما خرج ولأي مستند.
 *
 * وإشعارُ **السعر** بلا بضاعة يتبع الحكمَ نفسَه: ما بقي على الرفّ يتبع الطبقةَ (تكلفتُها تتغيّر معه
 * ويُقيَّد على `1300`)، وما استُهلك بيع بسعره القديم فأثرُه **تكلفةُ مبيعاتٍ في فترة الإشعار** (`5100`)
 * — لا في فترة البيع؛ فلا يُعاد كتابةُ تاريخ. والمدينُ (زيادةُ سعر) المرآةُ نفسُها.
 *
 * ⛔ وبابٌ يتجاوز ما أُغلق في ③ لا يُبنى (`ق-١٠٠٦`/⑥): الإشعارُ لا يُعيد ما بيع، ولا يمسّ طبقةً غيرَ طبقة
 * الأصل. وتُكتب الطبقاتُ هنا بالمخطَّط مباشرةً كما يكتبها `purchase-receipt.util` — فالنواةُ لا
 * تستورد المحرّك (`§3`).
 */
type Tx = Prisma.TransactionClient;

export interface SupplierNoteStockLine {
  id: string;
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  returnsPurchaseLineId: string | null;
  goodsReturned: boolean;
}

export interface SupplierNoteStockArgs {
  companyId: string;
  branchId: string | null;
  date: Date;
  documentNo: string;
  side: 'credit' | 'debit';
  /** سعرُ الصرف من الأصل — الطبقةُ مقوَّمةٌ بالعملة الأساسية كالدفتر. */
  exchangeRate: number;
  lines: readonly SupplierNoteStockLine[];
}

export interface SupplierNoteStockResult {
  /** ما يُقيَّد على `1300` بالعملة الأساسية (تكلفةُ ما خرج + حصّةُ ما على الرفّ من فرق السعر). */
  baseInventory: number;
  /** ما يُقيَّد على `5100` في فترة الإشعار (حصّةُ المستهلَك من فرق السعر + فرقُ سعر المُعاد عن تكلفة طبقته). */
  baseCogs: number;
  returned: { lineId: string; qty: number; layerId: string }[];
}

/**
 * يطبّق أثرَ إشعار المورّد على الرفّ سطراً سطراً — انظر رأسَ الملفّ.
 *
 * **على مستوى المنشأة بحقّها**: طبقةُ الاستلام تُقرأ بسطر الشراء الأصليّ لا بفرع القارئ — فالمُعادةُ تخرج
 * من حيث استُلمت، كما يعود المرتجعُ إلى طبقاته حيث بيعت؛ وإعادةٌ تُقاس على فرعٍ آخر تُخرج مرّتين.
 */
export async function applySupplierNoteToStock(tx: Tx, args: SupplierNoteStockArgs): Promise<SupplierNoteStockResult> {
  let baseInventory = 0;
  let baseCogs = 0;
  const returned: SupplierNoteStockResult['returned'] = [];

  for (const line of args.lines) {
    if (!line.returnsPurchaseLineId) continue;
    // ٢٥ حدٌّ معلَن لا صامت (`ق-١١٣١`/ز): الإشعارُ يعمل على **طبقة الاستلام الأصلية الواحدة** — فسطرٌ لم
    // يُستلم كاملاً (قيمتُه على الوسيط لا على الرفّ) أو استُلم على أكثر من استلامٍ يُردّ مسمّىً حتى يُعمَّم.
    const original = await tx.purchaseLine.findUnique({
      where: { id: line.returnsPurchaseLineId },
      select: { productId: true, quantity: true, receiptLines: { where: { goodsReceipt: { voidedAt: null } }, select: { goodsReceiptId: true, quantity: true } } },
    });
    // بندٌ خدميّ — قيمتُه إلى حساب الفئة، ولا رفَّ له.
    if (!original?.productId) continue;
    const receivedQty = original.receiptLines.reduce((t, r) => t + Number(r.quantity), 0);
    if (roundTo(Number(original.quantity) - receivedQty, 'DERIVED_QUANTITY') > 0) {
      throw new BadRequestException(formatMessage(MSG.supplier_note_line_not_received, { no: args.documentNo }));
    }
    if (new Set(original.receiptLines.map((r) => r.goodsReceiptId)).size > 1) {
      throw new BadRequestException(formatMessage(MSG.supplier_note_line_multi_receipt, { no: args.documentNo }));
    }
    const receipt = await tx.stockMovement.findFirst({
      where: { purchaseLineId: line.returnsPurchaseLineId, type: 'IN', origin: 'RECEIPT', OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: { voidedAt: null } } }] },
      select: { id: true, productId: true, warehouseId: true },
    });
    // سطرٌ استُلم بلا حركةٍ تُقرأ (لا يقع بعد البناء) — كما كان: لا رفَّ له.
    if (!receipt) continue;
    const layer = await tx.inventoryLayer.findFirst({
      where: { sourceMovementId: receipt.id },
      select: { id: true, qtyRemaining: true, unitCost: true },
    });
    if (!layer) continue;

    const qty = roundTo(Number(line.quantity), 'DERIVED_QUANTITY');
    if (qty <= 0) continue;
    const unitBase = Number(line.unitPrice) * args.exchangeRate;
    const layerCost = Number(layer.unitCost);
    const remaining = Number(layer.qtyRemaining);

    if (args.side === 'credit' && line.goodsReturned) {
      // إعادةُ بضاعةٍ إلى المورّد: خروجٌ من الطبقة نفسِها بكتابةٍ مشروطة — الموضعُ الرابع من `ق-٨١٤` —
      // فما ليس على الرفّ لا يخرج، ولو تقادمت القراءة.
      const { count } = await tx.inventoryLayer.updateMany({
        where: { id: layer.id, qtyRemaining: { gte: qty } },
        data: { qtyRemaining: { decrement: qty } },
      });
      if (count === 0) throw new BadRequestException(formatMessage(MSG.supplier_return_exceeds_stock, { remaining, requested: qty }));
      // الحركةُ تحمل سطرَ الإشعار (والمُشغِّل يرفضها إن خالف الصنف) — والاستهلاكُ صفٌّ على الطبقة بحركته.
      const movement = await tx.stockMovement.create({
        data: {
          companyId: args.companyId,
          productId: receipt.productId,
          warehouseId: receipt.warehouseId,
          branchId: args.branchId,
          type: 'OUT',
          origin: 'RECEIPT',
          purchaseLineId: line.id,
          qty,
          date: args.date,
          reason: `إعادةٌ إلى المورّد ${args.documentNo}`,
        },
        select: { id: true },
      });
      await tx.inventoryConsumption.create({
        data: { companyId: args.companyId, layerId: layer.id, movementId: movement.id, qty, unitCost: layerCost },
      });
      const cost = qty * layerCost;
      baseInventory += cost;
      // فرقُ ما ائتمن به المورّد عن تكلفة الطبقة — في فترة الإشعار.
      baseCogs += qty * unitBase - cost;
      returned.push({ lineId: line.id, qty, layerId: layer.id });
      continue;
    }

    // إشعارُ سعرٍ بلا بضاعة (دائنٌ يخفّض التكلفة، ومدينٌ يزيدها): ما على الرفّ يتبع الطبقة، وما استُهلك إلى 5100.
    // ٧ الحكمُ دالّةٌ واحدة تخدم التكلفةَ المحمَّلة أيضاً (`layer-cost-spread.util`) — لا نسخةً.
    const spread = spreadCostOverLayer({ unitsAffected: qty, perUnitAmount: unitBase, direction: args.side === 'credit' ? -1 : 1, qtyRemaining: remaining, unitCost: layerCost });
    if (spread.onShelfQty > 0) {
      await tx.inventoryLayer.update({ where: { id: layer.id }, data: { unitCost: spread.newUnitCost } });
      baseInventory += spread.baseInventory;
    }
    baseCogs += spread.baseCogs;
  }

  return { baseInventory: roundTo(baseInventory, 'LINE_AMOUNT'), baseCogs: roundTo(baseCogs, 'LINE_AMOUNT'), returned };
}
