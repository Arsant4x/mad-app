import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveReceiptBatch } from '../common/batches/stock-batch.util';
import { MSG } from '../common/i18n/messages';
import { postProvisionalSettlementEntries } from '../journal/auto-posting.util';
import { settleProvisionalConsumptions } from '../journal/provisional-settlement.util';

/**
 * **الاستلام — حدثُ التكلفة** (ق-١٩)، وله كيانُه منذ `٢٥` (ق-١١٣١).
 *
 * حدث التكلفة هو **الاستلام** لا الفوترة. وكان الاستلامُ ضمنيّاً بلا كيان؛ فصار
 * لكلِّ وصولٍ مستندُه (`GoodsReceipt`) وهذا الملفُّ يكتب **رفَّه**: حركةً وطبقةً
 * لكلِّ سطرِ استلام. والضمنيُّ باقٍ افتراضاً (يُولَّد مع الشراء ما لم يُطلب غيرُه) —
 * «الصيدلية ترى تجربة اليوم، وتاجر الجملة يرى الدورة، **بمخطط واحد**».
 *
 * ## ⭐ والقاعدة البنيوية مطبَّقة هنا لا موصوفة
 *
 * كل حركة تُنشأ هنا تحمل `purchaseLineId`، **فمُشغِّل القاعدة يرفضها إن كان
 * السطر بلا صنف أو إن خالف صنفُها صنفَه**. ولا يستطيع هذا المسار — ولا أي
 * مسارٍ آخر — أن يُنشئ حركةً بلا صنف: **ليس انضباطاً يُتذكَّر، بل قيدٌ تحت
 * الشيفرة كلها**.
 *
 * وهو الدرس الذي كلّفنا عطل الكاشير: مسارٌ يعرف الصنف ثم يرميه، فتخرج البضاعة
 * من الرفّ ولا يقول المستند ماذا خرج.
 *
 * ## وبضاعةٌ بلا مستودع تُرفض
 *
 * ⚠️ **ولا تُتخطّى بصمت.** البديل — إنشاء الشراء بلا طبقة — يعني مخزوناً في
 * الميزانية بلا طبقةٍ تُستهلك منه، فيقع أول بيعٍ على **استهلاكٍ مؤقّت** بلا
 * سبب. والرفض يُقرأ ويُصحَّح؛ والتخطّي يُكتشف بعد شهر في تقرير هامش.
 */

type Tx = Prisma.TransactionClient;

/**
 * ٢٥ سطرُ استلامٍ يُكتب رفّاً: سطرُ الشراء (المصدرُ الذي يوجبه المُشغِّل) وسطرُ الاستلام (المستندُ)
 * **معاً** على الحركة، والكمّيةُ كمّيةُ **هذا الاستلام** لا كمّيةُ السطر — فالجزئيُّ مقبول (`ق-١١٢٢`/②).
 */
export interface ReceiptLine {
  /** سطرُ الشراء. */
  id: string;
  /** سطرُ الاستلام الذي تُكتب له الحركة. */
  goodsReceiptLineId: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  /** ٥+٦ الدفعةُ كما وصلت على السطر — الاستلامُ يصنع منها الكيانَ ويربط طبقتَه به (`ق-١٠٨٦`). */
  batchNo?: string | null;
  expiryDate?: Date | null;
}

export interface ReceiveArgs {
  companyId: string;
  branchId: string | null;
  /** مستودعُ الاستلام — محلولٌ قبل النداء (`resolveReceiptWarehouse`). */
  warehouseId: string;
  /** تاريخُ الاستلام — **وهو تاريخُ الطبقة** (`acquiredAt`)، لا تاريخُ الفاتورة. */
  date: Date;
  /** سعر الصرف: الطبقة تُقوَّم بالعملة الأساسية كالدفتر. */
  exchangeRate: number;
  lines: ReceiptLine[];
  /** مرجعُ المستند لقيد تسوية المؤقّت — رقمُ الاستلام (ق-١٠٦٣/١). */
  ref?: string;
}

/**
 * مستودعُ الاستلام: ما حُدِّد صراحةً، وإلا فمستودعُ الفرع — **وبضاعةٌ بلا مستودع تُرفض ولا تُتخطّى**
 * (انظر رأس الملفّ).
 */
export async function resolveReceiptWarehouse(tx: Tx, explicit: string | null | undefined, branchId: string | null): Promise<string> {
  const warehouseId =
    explicit ??
    (branchId ? (await tx.branch.findUnique({ where: { id: branchId }, select: { warehouseId: true } }))?.warehouseId ?? null : null);
  if (!warehouseId) throw new BadRequestException(MSG.purchase_stocked_needs_warehouse);
  return warehouseId;
}

/** ينشئ حركة استلام وطبقة تكلفة لكل سطرِ استلامٍ مخزنيّ. */
export async function receiveStockedLines(tx: Tx, args: ReceiveArgs): Promise<{ layers: number }> {
  const stocked = args.lines.filter((l) => l.productId !== null);
  if (stocked.length === 0) return { layers: 0 };
  const warehouseId = args.warehouseId;

  for (const line of stocked) {
    const qty = Number(line.quantity);
    const unitCost = Number(line.unitPrice) * args.exchangeRate;

    // ٥+٦ الدفعةُ تُحلّ **قبل** أن يُكتب شيء (`ق-١٠٨٦`): صنفٌ معلَنٌ تتبّعُه بلا دفعة، أو رقمٌ قائمٌ بانتهاءٍ آخر —
    // يُردّان مسمَّيَين والحكمُ فيهما للمالك؛ فلا حركةَ ولا طبقة.
    const product = await tx.product.findUnique({ where: { id: line.productId! }, select: { expiryTracked: true } });
    const batchId = await resolveReceiptBatch(tx, args.companyId, {
      productId: line.productId!,
      expiryTracked: product?.expiryTracked ?? null,
      batchNo: line.batchNo ?? null,
      expiryDate: line.expiryDate ?? null,
    });

    const movement = await tx.stockMovement.create({
      data: {
        companyId: args.companyId,
        productId: line.productId!,
        warehouseId,
        branchId: args.branchId,
        type: 'IN',
        origin: 'RECEIPT',
        purchaseLineId: line.id,
        goodsReceiptLineId: line.goodsReceiptLineId,
        qty,
        date: args.date,
        // نصُّ الدفعة على الحركة كما كان يُقرأ في قائمة الحركات — والكيانُ على الطبقة.
        batchNo: batchId ? (line.batchNo?.trim() ?? null) : null,
        expiryDate: batchId ? (line.expiryDate ?? null) : null,
      },
      select: { id: true },
    });

    const layer = await tx.inventoryLayer.create({
      data: {
        companyId: args.companyId,
        productId: line.productId!,
        warehouseId,
        qtyReceived: qty,
        qtyRemaining: qty,
        unitCost,
        // ⚠️ تاريخ الاستلام لا تاريخ الإدخال — وهو ما يرتّب FIFO.
        acquiredAt: args.date,
        sourceType: 'GOODS_RECEIPT',
        sourceMovementId: movement.id,
        batchId,
      },
      select: { id: true },
    });

    // ㉘ الوعدُ يُنفَّذ (ق-١٠٦٣/١): ما بيع قبل هذا الاستلام بتكلفةٍ مؤقّتة يُسوَّى الآن بطبقته الحقيقية، وفرقُ
    // التكلفة يُرحَّل على 5100/1300 — كان هذا السطرُ تعليقاً في `consumeFifo` بلا كاتب.
    const settled = await settleProvisionalConsumptions(tx, args.companyId, { productId: line.productId!, warehouseId, layerId: layer.id });
    if (settled.settled > 0) {
      // ق-١٣٦٣ — فرقُ كلِّ مؤقّتٍ على حساب مصدره: البيعُ تكلفةُ مبيعات، والحركةُ اليدويةُ فروقاتُ المخزون.
      await postProvisionalSettlementEntries(tx, args.companyId, { branchId: args.branchId, ref: `استلام ${args.ref ?? ''}`.trim(), date: args.date, byOrigin: settled.costDeltaByOrigin });
    }
  }

  return { layers: stocked.length };
}
