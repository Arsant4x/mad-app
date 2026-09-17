import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * ⚖️ **عكسُ الاستلام — بحركةٍ خارجة من طبقته لا بحذفه** (`ق-٩٩٧`/① «بعكسٍ لا بحذف، والرفُّ يتبع»).
 *
 * لكلِّ سطرٍ مخزنيٍّ حيّ: طبقتُه يجب أن تكون **كاملةً** (لم يُستهلك منها شيء — ولا بإعادةٍ إلى المورّد)،
 * فتُفرَغ بكتابةٍ مشروطة (`ق-٨١٤`) وحركةِ `OUT` تحمل السطرَ **واستهلاكٍ مسجَّلٍ صفّاً** — فيبقى دفترُ
 * المخزون راوياً ما وقع، وتبقى معادلةُ الطبقة صادقة. وما استُهلك منه **مجمَّد** — يرفض مسمّىً.
 * وتُكتب الطبقاتُ هنا بالمخطَّط مباشرةً كما في `purchase-receipt.util` — فالنواةُ لا تستورد المحرّك (`§3`).
 */
type Tx = Prisma.TransactionClient;

export interface ReceiptLineRef {
  id: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
}

/**
 * هل استُهلك شيءٌ من استلام هذه السطور (بيعاً أو إعادةً أو غيرَه)؟ — تعريفُ الاستهلاك **بالحال** (`ق-٩٩٩`):
 * طبقةٌ ناقصةٌ عمّا استُلم، أياً كان ما أنقصها.
 *
 * **على مستوى المنشأة بحقّها**: طبقةُ الاستلام تُقرأ بسطر الشراء لا بفرع القارئ — فاستهلاكٌ من فرعٍ آخر
 * يجمّد الكميةَ والتكلفةَ كما يجمّدها استهلاكُ فرعه، وإلا عُدِّل ما بيع منه في فرعٍ محجوب.
 */
export async function receiptConsumed(tx: Tx, lines: readonly ReceiptLineRef[]): Promise<boolean> {
  for (const line of lines) {
    if (!line.productId) continue;
    const receipt = await tx.stockMovement.findFirst({ where: { purchaseLineId: line.id, type: 'IN', origin: 'RECEIPT' }, select: { id: true } });
    if (!receipt) continue;
    const layer = await tx.inventoryLayer.findFirst({ where: { sourceMovementId: receipt.id }, select: { qtyReceived: true, qtyRemaining: true } });
    if (layer && Number(layer.qtyRemaining) < Number(layer.qtyReceived)) return true;
  }
  return false;
}

export interface ReverseReceiptArgs {
  companyId: string;
  branchId: string | null;
  date: Date;
  documentNo: string;
  reason: string;
  lines: readonly ReceiptLineRef[];
}

/**
 * يعكس استلامَ السطور المخزنية كلِّها — ويرمي مسمّىً إن كان شيءٌ منها قد استُهلك. يُعيد مستودعَ الاستلام
 * ليُستلم فيه الجديد.
 *
 * **على مستوى المنشأة بحقّها**: حركةُ الاستلام الأصلية تُقرأ بسطر الشراء لا بفرع القارئ — فالعكسُ يُخرج
 * البضاعةَ من المستودع الذي استُلمت فيه، وعكسٌ يُقاس على فرعٍ آخر يترك طبقةً معلَّقةً بلا مستند.
 */
export async function reverseReceipt(tx: Tx, args: ReverseReceiptArgs): Promise<{ warehouseId: string | null; reversedCost: number }> {
  let warehouseId: string | null = null;
  let reversedCost = 0;
  for (const line of args.lines) {
    if (!line.productId) continue;
    const receipt = await tx.stockMovement.findFirst({
      where: { purchaseLineId: line.id, type: 'IN', origin: 'RECEIPT' },
      select: { id: true, productId: true, warehouseId: true },
    });
    if (!receipt) continue;
    warehouseId = receipt.warehouseId;
    const layer = await tx.inventoryLayer.findFirst({ where: { sourceMovementId: receipt.id }, select: { id: true, qtyReceived: true, unitCost: true } });
    if (!layer) continue;
    const qty = Number(layer.qtyReceived);
    // الطبقةُ الكاملة وحدَها تُعكس — والشرطُ في الكتابة نفسِها لا في قراءةٍ سبقتها (`ق-٨١٤`).
    const { count } = await tx.inventoryLayer.updateMany({
      where: { id: layer.id, qtyRemaining: { gte: qty } },
      data: { qtyRemaining: { decrement: qty } },
    });
    if (count === 0) throw new ConflictException(formatMessage(MSG.purchase_frozen_after_consumption, { no: args.documentNo }));
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
        reason: args.reason,
      },
      select: { id: true },
    });
    await tx.inventoryConsumption.create({ data: { companyId: args.companyId, layerId: layer.id, movementId: movement.id, qty, unitCost: Number(layer.unitCost) } });
    reversedCost += qty * Number(layer.unitCost);
  }
  return { warehouseId, reversedCost };
}
