import type { Purchase } from '../../api/purchases';
import { today } from '../../lib/format';

/** Matches the original mockup's purchaseStatusBadge() — status is derived
 * (paid / due date proximity), never stored as its own field. */
export function purchaseStatus(p: Purchase): { label: string; badgeClass: string } {
  if (p.paid) return { label: 'مسدَّدة', badgeClass: 'paid' };
  if (!p.dueDate) return { label: 'بلا تاريخ استحقاق', badgeClass: 'draft' };

  const days = Math.floor((new Date(p.dueDate).getTime() - new Date(today()).getTime()) / 86400000);
  if (days < 0) return { label: 'متأخرة', badgeClass: 'overdue' };
  if (days <= 7) return { label: `تستحق خلال ${days} يوم`, badgeClass: 'due' };
  return { label: 'مستحقة', badgeClass: 'due' };
}
