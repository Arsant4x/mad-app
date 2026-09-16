import { Prisma } from '@prisma/client';
import { MSG } from '../common/i18n/messages';
import { allocatedFor, deriveSettlementStatus, SettlementTarget } from '../common/settlement/settlement.util';

/**
 * هدفُ تسوية المشتريات: الجدولُ `purchases` بمفتاح المورّد، والتخصيصاتُ `supplier_payment_allocations`
 * — والآليةُ كلُّها في `common/settlement` (`ق-٨٧١`: مستخرَجةٌ لا منسوخة).
 */
export const purchaseTarget = (tx: Prisma.TransactionClient): SettlementTarget => ({
  table: 'purchases',
  partyColumn: 'supplierId',
  documentKey: 'purchaseId',
  allocations: tx.supplierPaymentAllocation,
  documentNotFound: MSG.purchase_not_found,
  wrongParty: MSG.allocation_wrong_supplier,
});

/**
 * إعادةُ حساب حالة الشراء من تخصيصاته — **المدخلُ الوحيد** لكتابة `Purchase.status` (`ق-٨٧٢`).
 *
 * تُستدعى داخل معاملة كل تغييرٍ في التخصيصات أو في الإجمالي، فلا تنحرف المرآةُ عن الأصل لحظة.
 * ولا `OVERDUE` هنا: التأخّرُ يُقرأ من `dueDate` عند العرض ولا يُخزَّن.
 */
export async function recomputePurchaseStatus(tx: Prisma.TransactionClient, purchaseId: string): Promise<void> {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, select: { id: true, total: true, status: true } });
  if (!purchase) return;
  const status = deriveSettlementStatus(await allocatedFor(purchaseTarget(tx), purchaseId), Number(purchase.total));
  if (status !== purchase.status) await tx.purchase.update({ where: { id: purchaseId }, data: { status } });
}
