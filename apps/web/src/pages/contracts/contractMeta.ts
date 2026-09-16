import type { ContractClassification, ContractVatInclusion, DeclaredClassification, DeclaredVatInclusion } from '../../api/contracts';

export const CYCLE_LABEL: Record<string, string> = { monthly: 'شهرية', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' };

/** خياراتُ الإعلان — بلا القيمة القديمة: لا تُعرض ولا تُختار لعقدٍ جديد (ق-٨٩٨). */
export const CLASSIFICATION_OPTIONS: { value: DeclaredClassification; label: string }[] = [
  { value: 'RESIDENTIAL', label: 'سكني — معفى من ضريبة القيمة المضافة' },
  { value: 'COMMERCIAL', label: 'تجاري — خاضع للضريبة' },
];
export const VAT_INCLUSION_OPTIONS: { value: DeclaredVatInclusion; label: string }[] = [
  { value: 'EXCLUSIVE', label: 'غير شاملة للضريبة' },
  { value: 'INCLUSIVE', label: 'شاملة للضريبة' },
];
export const CLASSIFICATION_LABEL: Record<ContractClassification, string> = {
  RESIDENTIAL: 'سكني — معفى',
  COMMERCIAL: 'تجاري — خاضع',
  LEGACY_UNCLASSIFIED: 'قديم — غير مصنَّف',
};
export const VAT_INCLUSION_LABEL: Record<ContractVatInclusion, string> = {
  INCLUSIVE: 'شاملة للضريبة',
  EXCLUSIVE: 'غير شاملة للضريبة',
  LEGACY_UNDECLARED: 'قديم — غير معلَن',
};
export const isLegacyContract = (c: { classification: ContractClassification; vatInclusion: ContractVatInclusion }) =>
  c.classification === 'LEGACY_UNCLASSIFIED' || c.vatInclusion === 'LEGACY_UNDECLARED';
