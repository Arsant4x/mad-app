import type { Purchase } from '../../api/purchases';
import { fmt, today } from '../../lib/format';

/**
 * شارةُ حالة فاتورة الشراء — **من الحالة المشتقّة في الخادم** (`ق-٨٧٢`: من تخصيصات سندات الصرف)،
 * والتأخّرُ وحدَه يُقرأ هنا من تاريخ الاستحقاق لحظةَ العرض لأنه لا يُخزَّن.
 */
export function purchaseStatus(p: Purchase): { label: string; badgeClass: string } {
  // الإشعارُ الدائن لا يُسدَّد — هو التخفيض؛ حالتُه `PAID` بنيةً وليست «مسدَّدة» في العرض.
  if (p.docType === 'SUPPLIER_CREDIT_NOTE') return { label: 'يخفّض ذمّة المورّد', badgeClass: 'paid' };
  if (p.status === 'PAID') return { label: 'مسدَّدة', badgeClass: 'paid' };
  if (p.status === 'PARTIAL') return { label: `مسدَّدة جزئياً — متبقٍّ ${fmt(p.remaining)}`, badgeClass: 'due' };
  if (!p.dueDate) return { label: 'بلا تاريخ استحقاق', badgeClass: 'draft' };

  const days = Math.floor((new Date(p.dueDate).getTime() - new Date(today()).getTime()) / 86400000);
  if (days < 0) return { label: 'متأخرة', badgeClass: 'overdue' };
  if (days <= 7) return { label: `تستحق خلال ${days} يوم`, badgeClass: 'due' };
  return { label: 'مستحقة', badgeClass: 'due' };
}
