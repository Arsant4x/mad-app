/**
 * ⑧ النسبةُ الأساسية لضريبة القيمة المضافة — نسخةُ الواجهة من المصدر الواحد (`ق-١٢١٢`).
 *
 * المصدرُ الحاكم `apps/api/src/common/vat/standard-rate.ts` (بمصدره النظاميّ هناك)؛ وهذه النسخةُ
 * تُطابَق به آلياً في `vat-rate-single-source.spec.ts` — فلا يُكتب الرقمُ حرفياً في سياق ضريبةٍ
 * في الواجهة (كان في شاشتين والكاشير ونافذة العقد سبعَ مرّات).
 *
 * والنسبةُ للعرض والمعاينة وحدَهما: الخادمُ يشتقّها من فئة الصنف على كل سطرٍ ويعيد المجاميع.
 */
export const STANDARD_VAT_RATE = 15;

/** معاملُ الإجمالي من الصافي (`1.15`) — للمعاينة قبل أن يعيد الخادمُ الرقمَ المعتمَد. */
export const STANDARD_VAT_GROSS_FACTOR = 1 + STANDARD_VAT_RATE / 100;

/** الضريبةُ الشاملة في مبلغٍ إجماليّ: `gross × 15 / 115` — بلا تدوير (التدويرُ من `lib/money`). */
export function standardVatIncludedIn(gross: number): number {
  return (gross * STANDARD_VAT_RATE) / (100 + STANDARD_VAT_RATE);
}
