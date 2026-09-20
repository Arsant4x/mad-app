import type { ContractClassification, ContractStatus, ContractVatInclusion } from '../../api/contracts';
import type { BadgeMeta } from '../../lib/statusBadge';

/** شاراتُ الحالة — `Record<Status, …>` يُسقط الترجمة إن أُضيفت قيمةٌ بلا مقابل، و`badgeOf` يرسم المجهولَ خاماً وقتَ التشغيل. */
export const CONTRACT_STATUS_META: Record<ContractStatus, BadgeMeta> = {
  DRAFT: { label: 'مسودة', badgeClass: 'draft' },
  UPCOMING: { label: 'قادم مؤكَّد', badgeClass: 'due' },
  DUE: { label: 'سارٍ', badgeClass: 'paid' },
  LATE: { label: 'متأخر', badgeClass: 'overdue' },
  CANCELLED: { label: 'ملغى', badgeClass: 'draft' },
};

/** التصنيفُ للضريبة — القيمةُ القديمة **تُعرض باسمها** وتُعلَّم، لا تُخفى (`ق-٨٩٨`). */
export const CLASSIFICATION_META: Record<ContractClassification, BadgeMeta> = {
  RESIDENTIAL: { label: 'سكنيّ · معفى', badgeClass: 'paid' },
  COMMERCIAL: { label: 'تجاريّ · خاضع', badgeClass: 'due' },
  LEGACY_UNCLASSIFIED: { label: 'غير مصنَّف', badgeClass: 'overdue' },
};

export const VAT_INCLUSION_META: Record<ContractVatInclusion, BadgeMeta> = {
  INCLUSIVE: { label: 'شاملٌ للضريبة', badgeClass: 'paid' },
  EXCLUSIVE: { label: 'غيرُ شامل', badgeClass: 'due' },
  LEGACY_UNDECLARED: { label: 'غير معلَن', badgeClass: 'overdue' },
};

export const CLASSIFICATION_OPTIONS = [
  { value: 'RESIDENTIAL', label: 'سكنيّ — معفى من الضريبة' },
  { value: 'COMMERCIAL', label: 'تجاريّ — خاضع للضريبة' },
] as const;

export const VAT_INCLUSION_OPTIONS = [
  { value: 'INCLUSIVE', label: 'القيمةُ شاملةٌ للضريبة' },
  { value: 'EXCLUSIVE', label: 'القيمةُ غيرُ شاملة — تُضاف عليها' },
] as const;
