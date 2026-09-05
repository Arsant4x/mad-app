import type { InvoiceStatus, ZatcaInvoiceStatus } from '../../api/invoices';

export const STATUS_META: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  /** أُضيفت في 4.5 إلى المخطط وإلى recomputeInvoiceStatus ونُسيت هنا، فكانت
   *  STATUS_META['PARTIAL'] تعود undefined وينهار كل ما يعرض شارتها. */
  PARTIAL: { label: 'مسدَّدة جزئياً', badgeClass: 'due' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
  OVERDUE: { label: 'متأخرة', badgeClass: 'overdue' },
};

/** PARTIAL خارج هذه القائمة عمداً: هي **مشتقّة** من التخصيصات ولا يضبطها
 *  مستخدم يدوياً (قاعدة 4.5) — وهذه القائمة تغذّي مُنتقي تغيير الحالة. */
export const STATUS_ORDER: InvoiceStatus[] = ['DUE', 'PAID', 'OVERDUE'];

/** Clearance state with the authority — deliberately separate from the payment
 * status above: a paid invoice may be uncleared, and a cleared one unpaid. */
export const ZATCA_STATUS_META: Record<ZatcaInvoiceStatus, { label: string; badgeClass: string }> = {
  NOT_SUBMITTED: { label: 'لم تُرسل', badgeClass: '' },
  SUBMITTING: { label: 'قيد الإرسال', badgeClass: 'due' },
  STAMPED: { label: 'مختومة — بانتظار الإبلاغ', badgeClass: 'due' },
  CLEARED: { label: 'مصدَّقة', badgeClass: 'paid' },
  REJECTED: { label: 'مرفوضة', badgeClass: 'overdue' },
};
