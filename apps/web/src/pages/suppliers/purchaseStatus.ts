import type { Purchase } from '../../api/purchases';
import i18n from '../../i18n';
import { fmt, today } from '../../lib/format';

/**
 * Purchase invoice status badge, from the status the server derives from
 * payment voucher allocations. Only "overdue" is read here, from the due date at
 * display time, because it is not stored. The label is translated on each call.
 */
export function purchaseStatus(p: Purchase): { label: string; badgeClass: string } {
  // Voided by a reversing entry: stays in the records with nothing owed.
  if (p.voidedAt) return { label: i18n.t('suppliers.status.voided'), badgeClass: 'draft' };
  // A credit note is the reduction itself; its status is PAID by structure, not "paid" for display.
  if (p.docType === 'SUPPLIER_CREDIT_NOTE') return { label: i18n.t('suppliers.status.credit_note'), badgeClass: 'paid' };
  if (p.status === 'PAID') return { label: i18n.t('suppliers.status.paid'), badgeClass: 'paid' };
  if (p.status === 'PARTIAL') return { label: i18n.t('suppliers.status.partial', { amount: fmt(p.remaining) }), badgeClass: 'due' };
  if (!p.dueDate) return { label: i18n.t('suppliers.status.no_due_date'), badgeClass: 'draft' };

  const days = Math.floor((new Date(p.dueDate).getTime() - new Date(today()).getTime()) / 86400000);
  if (days < 0) return { label: i18n.t('suppliers.status.overdue'), badgeClass: 'overdue' };
  if (days <= 7) return { label: i18n.t('suppliers.status.due_within', { days }), badgeClass: 'due' };
  return { label: i18n.t('suppliers.status.due'), badgeClass: 'due' };
}
