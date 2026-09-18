import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MSG } from '../common/i18n/messages';
import { postCogsSettlementEntry } from '../journal/auto-posting.util';
import { settleProvisionalConsumptions } from '../journal/provisional-settlement.util';

/**
 * **الاستلام الضمني** — قرار المالك (ق-١٩).
 *
 * حدث التكلفة هو **الاستلام** لا الفوترة. ولا كيانَ استلامٍ مستقلاً بعد، فمن
 * لم يفعّل دورة أوامر الشراء يُولَّد له استلامٌ ضمنيّ من الشراء نفسه —
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

export interface ReceiptLine {
  id: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
}

export interface ReceiveArgs {
  companyId: string;
  branchId: string | null;
  /** مستودع الشراء إن حُدِّد صراحةً — وإلا فمستودع الفرع. */
  warehouseId?: string | null;
  date: Date;
  /** سعر الصرف: الطبقة تُقوَّم بالعملة الأساسية كالدفتر. */
  exchangeRate: number;
  lines: ReceiptLine[];
  /** مرجعُ المستند لقيد تسوية المؤقّت — رقمُ الشراء (ق-١٠٦٣/١). */
  ref?: string;
}

/** ينشئ حركة استلام وطبقة تكلفة لكل بندٍ مخزني. */
export async function receiveStockedLines(tx: Tx, args: ReceiveArgs): Promise<{ layers: number }> {
  const stocked = args.lines.filter((l) => l.productId !== null);
  if (stocked.length === 0) return { layers: 0 };

  const warehouseId =
    args.warehouseId ??
    (args.branchId
      ? (await tx.branch.findUnique({ where: { id: args.branchId }, select: { warehouseId: true } }))?.warehouseId ?? null
      : null);

  if (!warehouseId) throw new BadRequestException(MSG.purchase_stocked_needs_warehouse);

  for (const line of stocked) {
    const qty = Number(line.quantity);
    const unitCost = Number(line.unitPrice) * args.exchangeRate;

    const movement = await tx.stockMovement.create({
      data: {
        companyId: args.companyId,
        productId: line.productId!,
        warehouseId,
        branchId: args.branchId,
        type: 'IN',
        origin: 'RECEIPT',
        purchaseLineId: line.id,
        qty,
        date: args.date,
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
      },
      select: { id: true },
    });

    // ㉘ الوعدُ يُنفَّذ (ق-١٠٦٣/١): ما بيع قبل هذا الاستلام بتكلفةٍ مؤقّتة يُسوَّى الآن بطبقته الحقيقية، وفرقُ
    // التكلفة يُرحَّل على 5100/1300 — كان هذا السطرُ تعليقاً في `consumeFifo` بلا كاتب.
    const settled = await settleProvisionalConsumptions(tx, args.companyId, { productId: line.productId!, warehouseId, layerId: layer.id });
    if (settled.settled > 0) {
      await postCogsSettlementEntry(tx, args.companyId, { branchId: args.branchId, ref: `استلام ${args.ref ?? ''}`.trim(), date: args.date, baseDelta: settled.costDelta });
    }
  }

  return { layers: stocked.length };
}
