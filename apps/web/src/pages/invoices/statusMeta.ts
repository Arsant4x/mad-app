import type { InvoiceStatus, ZatcaInvoiceStatus } from '../../api/invoices';

export const STATUS_META: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
  OVERDUE: { label: 'متأخرة', badgeClass: 'overdue' },
};

export const STATUS_ORDER: InvoiceStatus[] = ['DUE', 'PAID', 'OVERDUE'];

/** Clearance state with the authority — deliberately separate from the payment
 * status above: a paid invoice may be uncleared, and a cleared one unpaid. */
export const ZATCA_STATUS_META: Record<ZatcaInvoiceStatus, { label: string; badgeClass: string }> = {
  NOT_SUBMITTED: { label: 'لم تُرسل', badgeClass: '' },
  SUBMITTING: { label: 'قيد الإرسال', badgeClass: 'due' },
  CLEARED: { label: 'مصدَّقة', badgeClass: 'paid' },
  REJECTED: { label: 'مرفوضة', badgeClass: 'overdue' },
};
