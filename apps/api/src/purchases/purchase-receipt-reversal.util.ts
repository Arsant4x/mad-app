import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { postReversalEntry } from '../journal/auto-posting.util';

/**
 * ⚖️ **عكسُ الاستلام — بحركةٍ خارجة من طبقته لا بحذفه** (`ق-٩٩٧`/① «بعكسٍ لا بحذف، والرفُّ يتبع»).
 *
 * منذ `٢٥` (`ق-١١٣١`) وحدةُ العكس هي **الاستلامُ** (`GoodsReceipt`) لا سطرُ الشراء: لكلِّ سطرِ استلامٍ
 * حيّ طبقتُه يجب أن تكون **كاملةً** (لم يُستهلك منها شيء — ولا بإعادةٍ إلى المورّد)، فتُفرَغ بكتابةٍ مشروطة
 * (`ق-٨١٤`) وحركةِ `OUT` تحمل سطرَ الشراء وسطرَ الاستلام معاً **واستهلاكٍ مسجَّلٍ صفّاً** — فيبقى دفترُ
 * المخزون راوياً ما وقع، وتبقى معادلةُ الطبقة صادقة. وما استُهلك منه **مجمَّد** — يرفض مسمّىً. ثم يُعكس
 * قيدُ الاستلام (إن كان له قيد — استلاماتُ ما قبل البناء رُحِّلت داخل قيد شرائها) ويُختم الاستلامُ
 * بـ`voidedAt`. وتُكتب الطبقاتُ هنا بالمخطَّط مباشرةً كما في `purchase-receipt.util` — فالنواةُ لا
 * تستورد المحرّك (`§3`).
 */
type Tx = Prisma.TransactionClient;

export interface ReceiptLineRef {
  id: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
}

/**
 * هل استُهلك شيءٌ من استلامات هذه السطور (بيعاً أو إعادةً أو غيرَه)؟ — تعريفُ الاستهلاك **بالحال** (`ق-٩٩٩`):
 * طبقةٌ ناقصةٌ عمّا استُلم، أياً كان ما أنقصها. **وكلُّ استلامات السطر** تُقرأ لا أوّلُها — فالسطرُ قد يُستلم
 * على مرّات (`ق-١١٢٢`/②).
 *
 * **على مستوى المنشأة بحقّها**: طبقةُ الاستلام تُقرأ بسطر الشراء لا بفرع القارئ — فاستهلاكٌ من فرعٍ آخر
 * يجمّد الكميةَ والتكلفةَ كما يجمّدها استهلاكُ فرعه، وإلا عُدِّل ما بيع منه في فرعٍ محجوب.
 */
export async function receiptConsumed(tx: Tx, lines: readonly ReceiptLineRef[]): Promise<boolean> {
  for (const line of lines) {
    if (!line.productId) continue;
    // استلامٌ مُلغىً طبقتُه مُفرَغةٌ بعكسه لا باستهلاك — فلا يُقرأ؛ وحركةٌ بلا سطرِ استلام (قبل البناء) تُقرأ.
    const receipts = await tx.stockMovement.findMany({
      where: {
        purchaseLineId: line.id,
        type: 'IN',
        origin: 'RECEIPT',
        OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: { voidedAt: null } } }],
      },
      select: { id: true },
    });
    for (const receipt of receipts) {
      const layer = await tx.inventoryLayer.findFirst({ where: { sourceMovementId: receipt.id }, select: { qtyReceived: true, qtyRemaining: true } });
      if (layer && Number(layer.qtyRemaining) < Number(layer.qtyReceived)) return true;
    }
  }
  return false;
}

export interface ReverseGoodsReceiptArgs {
  companyId: string;
  branchId: string | null;
  /** تاريخُ العكس — الحركةُ الخارجة وقيدُ العكس به. */
  date: Date;
  /** رقمُ المستند للرسالة المسمّاة. */
  documentNo: string;
  reason: string;
  receiptId: string;
}

/**
 * يعكس استلاماً واحداً بسطوره كلِّها: الطبقاتُ تُفرَغ بشرطها، والحركاتُ الخارجة تُكتب بسطريها، والقيدُ يُعكس،
 * والاستلامُ يُختم. يرمي مسمّىً إن كان شيءٌ منه قد استُهلك، ويعيد مستودعَه وتكلفةَ ما عُكس.
 *
 * **على مستوى المنشأة بحقّها**: حركةُ الاستلام تُقرأ بسطر استلامها لا بفرع القارئ — فالعكسُ يُخرج البضاعةَ من
 * المستودع الذي استُلمت فيه، وعكسٌ يُقاس على فرعٍ آخر يترك طبقةً معلَّقةً بلا مستند (كما في العكس بسطر الشراء).
 */
export async function reverseGoodsReceipt(tx: Tx, args: ReverseGoodsReceiptArgs): Promise<{ warehouseId: string; reversedCost: number }> {
  const receipt = await tx.goodsReceipt.findUnique({
    where: { id: args.receiptId },
    select: { id: true, no: true, warehouseId: true, voidedAt: true, journalEntryId: true, lines: { select: { id: true, purchaseLineId: true } } },
  });
  if (!receipt) throw new ConflictException(MSG.goods_receipt_not_found);
  if (receipt.voidedAt) throw new ConflictException(MSG.goods_receipt_voided);

  let reversedCost = 0;
  for (const line of receipt.lines) {
    const movement = await tx.stockMovement.findFirst({
      where: { goodsReceiptLineId: line.id, type: 'IN', origin: 'RECEIPT' },
      select: { id: true, productId: true, warehouseId: true },
    });
    if (!movement) continue;
    const layer = await tx.inventoryLayer.findFirst({ where: { sourceMovementId: movement.id }, select: { id: true, qtyReceived: true, unitCost: true } });
    if (!layer) continue;
    // ٧ طبقةٌ عليها توزيعُ تكلفةٍ محمَّلة قائم لا تُعكس — يُلغى التوزيعُ أوّلاً (`DELETE …/landed-costs/:id`) وإلا بقي
    // قيدُ إعادة تصنيفٍ على رفٍّ لم يعد له وجود. رفضٌ مسمّىً لا خطأَ قيدٍ خاماً.
    const distributed = await tx.landedCostLine.count({ where: { layerId: layer.id, distribution: { voidedAt: null } } });
    if (distributed > 0) throw new ConflictException(formatMessage(MSG.goods_receipt_void_with_landed_cost, { no: args.documentNo }));
    const qty = Number(layer.qtyReceived);
    // الطبقةُ الكاملة وحدَها تُعكس — والشرطُ في الكتابة نفسِها لا في قراءةٍ سبقتها (`ق-٨١٤`).
    const { count } = await tx.inventoryLayer.updateMany({
      where: { id: layer.id, qtyRemaining: { gte: qty } },
      data: { qtyRemaining: { decrement: qty } },
    });
    if (count === 0) throw new ConflictException(formatMessage(MSG.purchase_frozen_after_consumption, { no: args.documentNo }));
    const out = await tx.stockMovement.create({
      data: {
        companyId: args.companyId,
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        branchId: args.branchId,
        type: 'OUT',
        origin: 'RECEIPT',
        purchaseLineId: line.purchaseLineId,
        goodsReceiptLineId: line.id,
        qty,
        date: args.date,
        reason: args.reason,
      },
      select: { id: true },
    });
    await tx.inventoryConsumption.create({ data: { companyId: args.companyId, layerId: layer.id, movementId: out.id, qty, unitCost: Number(layer.unitCost) } });
    reversedCost += qty * Number(layer.unitCost);
  }

  // القيدُ يُعكس ولا يُحذف (`ق-٩٦٥`) — واستلامُ ما قبل البناء بلا قيدٍ خاصّ: رُحِّل داخل قيد شرائه.
  // والمذكّرةُ تسمّي الاستلامَ لا سببَه: قيدُ عكس الشراء يحمل «إلغاءُ فاتورة شراء …» وحدَه، فلا يُعدّ هذا معه.
  if (receipt.journalEntryId) {
    await postReversalEntry(tx, args.companyId, { entryId: receipt.journalEntryId, date: args.date, memo: `عكسُ قيد استلام ${receipt.no}` });
  }
  await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { voidedAt: args.date } });
  return { warehouseId: receipt.warehouseId, reversedCost };
}

export interface ReverseAllReceiptsArgs {
  companyId: string;
  branchId: string | null;
  date: Date;
  documentNo: string;
  reason: string;
  purchaseId: string;
}

/**
 * يعكس استلاماتِ الشراء الحيّةَ كلَّها (تعديلُ البنود · الإلغاء) — ويعيد مستودعَ آخرِها ليُستلم فيه الجديد،
 * وهل كان بينها ضمنيٌّ (فيُعاد الضمنيُّ بعد تعديل البنود كما كان، ولا يُستلم ما لم يكن مستلَماً).
 *
 * **على مستوى المنشأة بحقّها**: استلاماتُ الشراء تُقرأ بمعرّفه لا بفرع القارئ — فشراءٌ يُعدَّل أو يُلغى تُعكس
 * استلاماتُه كلُّها في أيّ فرعٍ كانت، وإلا بقي رفٌّ في فرعٍ محجوب لشراءٍ لم يعد له وجود.
 */
export async function reverseAllReceipts(tx: Tx, args: ReverseAllReceiptsArgs): Promise<{ warehouseId: string | null; hadImplicit: boolean; reversedCost: number }> {
  const receipts = await tx.goodsReceipt.findMany({
    where: { purchaseId: args.purchaseId, voidedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, implicit: true },
  });
  let warehouseId: string | null = null;
  let reversedCost = 0;
  let hadImplicit = false;
  for (const r of receipts) {
    const result = await reverseGoodsReceipt(tx, { ...args, receiptId: r.id });
    warehouseId = result.warehouseId;
    reversedCost += result.reversedCost;
    if (r.implicit) hadImplicit = true;
  }
  return { warehouseId, hadImplicit, reversedCost };
}
