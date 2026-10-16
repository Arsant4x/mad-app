import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { SettlementTarget, settlementStatusOf } from '../common/settlement/settlement.util';

/**
 * ما ائتمن به المورّد على كلِّ مستند — مجموعُ إشعاراته الدائنة عليه (`ق-١٠٠٦`/⑤). يقرؤه المتبقّي مع
 * التخصيصات في المصدر الواحد (`outstandingAfterNotes`)، كما تُقرأ الإشعاراتُ الدائنة على الفاتورة.
 *
 * **على مستوى المنشأة بحقّها**: ما ائتمن به المورّد يخفّض متبقّي مستنده أياً كان فرعُ الإشعار — وإشعارٌ في
 * فرعٍ محجوبٍ عن القارئ يبقى مخصوماً، وإلا طُولب المورّدُ بسدادٍ فوق ما بقي عليه.
 */
export async function creditedByPurchase(tx: Prisma.TransactionClient, purchaseIds: string[]): Promise<Map<string, number>> {
  if (purchaseIds.length === 0) return new Map();
  const rows = await tx.purchase.groupBy({
    by: ['relatedPurchaseId'],
    where: { relatedPurchaseId: { in: purchaseIds }, docType: 'SUPPLIER_CREDIT_NOTE' },
    _sum: { total: true },
  });
  return new Map(rows.map((r) => [r.relatedPurchaseId as string, round2(Number(r._sum.total ?? 0))]));
}

/** What a supplier payment may settle: a purchase or the supplier's debit note, which is paid like a purchase. */
export const PAYABLE_PURCHASE_KINDS = ['PURCHASE', 'SUPPLIER_DEBIT_NOTE'] as const;

/**
 * هدفُ تسوية المشتريات: الجدولُ `purchases` بمفتاح المورّد، والتخصيصاتُ `supplier_payment_allocations`
 * — والآليةُ كلُّها في `common/settlement` (`ق-٨٧١`: مستخرَجةٌ لا منسوخة).
 */
export const purchaseTarget = (tx: Prisma.TransactionClient): SettlementTarget => ({
  table: 'purchases',
  partyColumn: 'supplierId',
  documentKey: 'purchaseId',
  allocations: tx.supplierPaymentAllocation,
  payableKinds: PAYABLE_PURCHASE_KINDS,
  creditKind: 'SUPPLIER_CREDIT_NOTE',
  creditedOn: async (id) => (await creditedByPurchase(tx, [id])).get(id) ?? 0,
  isClosed: async (id) => (await tx.purchase.findUnique({ where: { id }, select: { voidedAt: true } }))?.voidedAt != null,
  documentNotFound: MSG.purchase_not_found,
  wrongParty: MSG.allocation_wrong_supplier,
  notPayable: MSG.allocation_not_payable,
  closedDocument: MSG.allocation_purchase_voided,
});

/**
 * إعادةُ حساب حالة الشراء من تخصيصاته — **المدخلُ الوحيد** لكتابة `Purchase.status` (`ق-٨٧٢`).
 *
 * تُستدعى داخل معاملة كل تغييرٍ في التخصيصات أو في الإجمالي، فلا تنحرف المرآةُ عن الأصل لحظة.
 * ولا `OVERDUE` هنا: التأخّرُ يُقرأ من `dueDate` عند العرض ولا يُخزَّن.
 * A supplier credit note on the purchase lowers what is due, so it is called after one is recorded too.
 */
export async function recomputePurchaseStatus(tx: Prisma.TransactionClient, purchaseId: string): Promise<void> {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, select: { id: true, docType: true, total: true, status: true } });
  if (!purchase) return;
  const status = await settlementStatusOf(purchaseTarget(tx), purchase);
  if (status !== purchase.status) await tx.purchase.update({ where: { id: purchaseId }, data: { status } });
}
