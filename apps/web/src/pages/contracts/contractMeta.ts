import type { ContractClassification, ContractVatInclusion, DeclaredClassification, DeclaredVatInclusion } from '../../api/contracts';

export const CYCLE_LABEL: Record<string, string> = { monthly: 'شهرية', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' };

/** خياراتُ الإعلان — بلا القيمة القديمة: لا تُعرض ولا تُختار لعقدٍ جديد (ق-٨٩٨). */
export const CLASSIFICATION_OPTIONS: { value: DeclaredClassification; label: string }[] = [
  { value: 'RESIDENTIAL', label: 'سكني — معفى من ضريبة القيمة المضافة' },
  { value: 'COMMERCIAL', label: 'تجاري — خاضع للضريبة' },
  // ⚖️ السؤالان ٥٩ و٤١٢ (ق-١٦٠٠): المخدومُ خاضعٌ وإن كان سكناً، والمختلطُ يُقسَّم بنسبةٍ يعلنها المؤجّر.
  { value: 'SERVICED_LODGING', label: 'إيواء مخدوم أو مؤقّت — خاضع للضريبة' },
  { value: 'MIXED', label: 'مختلط (سكني وتجاري في عقد واحد) — يُقسَّم بنسبة' },
];
export const VAT_INCLUSION_OPTIONS: { value: DeclaredVatInclusion; label: string }[] = [
  { value: 'EXCLUSIVE', label: 'غير شاملة للضريبة' },
  { value: 'INCLUSIVE', label: 'شاملة للضريبة' },
];
export const CLASSIFICATION_LABEL: Record<ContractClassification, string> = {
  RESIDENTIAL: 'سكني — معفى',
  COMMERCIAL: 'تجاري — خاضع',
  SERVICED_LODGING: 'إيواء مخدوم — خاضع',
  MIXED: 'مختلط — يُقسَّم بنسبة',
  LEGACY_UNCLASSIFIED: 'قديم — غير مصنَّف',
};
export const VAT_INCLUSION_LABEL: Record<ContractVatInclusion, string> = {
  INCLUSIVE: 'شاملة للضريبة',
  EXCLUSIVE: 'غير شاملة للضريبة',
  LEGACY_UNDECLARED: 'قديم — غير معلَن',
};
export const isLegacyContract = (c: { classification: ContractClassification; vatInclusion: ContractVatInclusion }) =>
  c.classification === 'LEGACY_UNCLASSIFIED' || c.vatInclusion === 'LEGACY_UNDECLARED';

/** أيدفع المستأجرُ ضريبةً على هذا الإيجار؟ — التجاريُّ والمخدومُ والمختلطُ بجزئه الخاضع (يطابق `isTaxedKind` في الخادم). */
export const isTaxedClassification = (classification: string) => classification === 'COMMERCIAL' || classification === 'SERVICED_LODGING' || classification === 'MIXED';

/**
 * **نسبةُ ما تُحسب عليه الضريبة من القسط** — 1 للخاضع كلِّه، و`1 − نصيب المعفى` للمختلط، و0 للمعفى والقديم.
 * للعرض والاقتراح وحدَهما: الرقمُ المرحَّلُ والإجماليُّ لكلِّ قسطٍ يصلان من الخادم (ق-١٢٤٣).
 */
export function taxedShareOf(contract: { classification: string; exemptSharePercent?: string | null }): number {
  if (contract.classification === 'COMMERCIAL' || contract.classification === 'SERVICED_LODGING') return 1;
  if (contract.classification === 'MIXED') {
    const exempt = Number(contract.exemptSharePercent ?? NaN);
    return Number.isFinite(exempt) && exempt > 0 && exempt < 100 ? 1 - exempt / 100 : 0;
  }
  return 0;
}
