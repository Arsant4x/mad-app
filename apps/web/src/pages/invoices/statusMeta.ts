import type { InvoiceStatus } from '../../api/invoices';

export const STATUS_META: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
  OVERDUE: { label: 'متأخرة', badgeClass: 'overdue' },
};

export const STATUS_ORDER: InvoiceStatus[] = ['DUE', 'PAID', 'OVERDUE'];
