import type { FormTemplateRow } from '../../api/forms';

/** حالُ إصدار القالب: المسوّدةُ تُحرَّر، والمنشورُ يُعبّأ عليه، والمؤرشفُ إصدارٌ سبقه منشورٌ أحدث. */
export const TEMPLATE_STATUS_META: Record<FormTemplateRow['status'], { label: string; badgeClass: string }> = {
  DRAFT: { label: 'مسوّدة', badgeClass: 'due' },
  PUBLISHED: { label: 'منشور', badgeClass: 'paid' },
  ARCHIVED: { label: 'مؤرشف', badgeClass: 'draft' },
};

/** الإصداراتُ بقالبها ثم بإصدارها الأحدث أوّلاً — فيُقرأ كلُّ قالبٍ متتابعاً. */
export function sortTemplateRows(rows: readonly FormTemplateRow[]): FormTemplateRow[] {
  return [...rows].sort((a, b) => (a.familyId === b.familyId ? b.version - a.version : a.name.localeCompare(b.name, 'ar') || a.familyId.localeCompare(b.familyId)));
}
