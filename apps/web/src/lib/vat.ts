/**
 * ⑧ ضريبةُ القيمة المضافة في الواجهة — نسخةُ الواجهة من مصدرَي الخادم (`ق-١٢١٢`).
 *
 * المصدرُ الحاكم في الخادم: `common/vat/standard-rate.ts` (النسبةُ الأساسية بمصدرها النظاميّ)
 * و`common/vat/exemption-reasons.ts` (قائمةُ الهيئة المغلقة من معيار XML 1.2 §11.2.4). وهذه النسخةُ
 * **تُطابَق بهما آلياً**: النسبةُ في `vat-rate-single-source.spec.ts` والقائمةُ في `exemption-reasons.spec.ts`
 * — فلا يُكتب رقمٌ ولا رمزٌ هنا من الذاكرة.
 *
 * والنسبةُ للعرض والمعاينة وحدَهما: الخادمُ يشتقّها من فئة الصنف على كل سطرٍ ويعيد المجاميع.
 */
import type { DeclarableTaxCategory } from '@mad-app/shared/api/enums';

export const STANDARD_VAT_RATE = 15;

/** معاملُ الإجمالي من الصافي (`1.15`) — للمعاينة قبل أن يعيد الخادمُ الرقمَ المعتمَد. */
export const STANDARD_VAT_GROSS_FACTOR = 1 + STANDARD_VAT_RATE / 100;

/** الضريبةُ الشاملة في مبلغٍ إجماليّ: `gross × 15 / 115` — بلا تدوير (التدويرُ من `lib/money`). */
export function standardVatIncludedIn(gross: number): number {
  return (gross * STANDARD_VAT_RATE) / (100 + STANDARD_VAT_RATE);
}

/**
 * ⚖️ **ضريبةُ جزءٍ خاضعٍ من مبلغ** (العقدُ المختلط · السؤال ٤١٢ · ق-١٦٠٠) — `share` نسبةُ الخاضع بين 0 و1 (1 للخاضع كلِّه).
 * غيرُ الشامل: النسبةُ على الجزء الخاضع · الشامل: `gross × s × 15 ÷ (100 + s × 15)`. بلا تدوير (التدويرُ من `lib/money`)،
 * ويطابقان `rentAmountsOf` في الخادم — والرقمُ المعتمَدُ يصل منه.
 */
export function standardVatOnShare(taxedPart: number): number {
  return (taxedPart * STANDARD_VAT_RATE) / 100;
}
export function standardVatIncludedInShare(gross: number, share: number): number {
  return (gross * share * STANDARD_VAT_RATE) / (100 + share * STANDARD_VAT_RATE);
}

/** الفئاتُ التي يُعلنها التاجر — والقيمتان القديمتان (`LEGACY_*`) تُقرآن ولا تُختاران. */
export type { DeclarableTaxCategory };
export type TaxCategory = DeclarableTaxCategory | 'LEGACY_STANDARD' | 'LEGACY_ZERO';

/** تسمياتُ الفئات كما في النموذج المرئيّ المُقرّ (`ق-١٢٢٢`). */
export const TAX_CATEGORY_OPTIONS: readonly { value: DeclarableTaxCategory; label: string; short: string }[] = [
  { value: 'S', label: `خاضعٌ بالنسبة الأساسية (S) — ${STANDARD_VAT_RATE}٪`, short: 'خاضعٌ بالنسبة الأساسية (S)' },
  { value: 'Z', label: 'خاضعٌ بنسبة الصفر (Z) — ٠٪ بسببٍ من قائمة الهيئة', short: 'خاضعٌ بنسبة الصفر (Z) — بسبب' },
  { value: 'E', label: 'معفى (E) — ٠٪ بسببٍ من قائمة الهيئة', short: 'معفى (E) — بسبب' },
  { value: 'O', label: 'خارج النطاق (O) — ٠٪ بسببٍ يكتبه التاجر', short: 'خارج النطاق (O) — بسبب يُكتب' },
];

export interface ExemptionReasonOption {
  code: string;
  category: 'Z' | 'E' | 'O';
  ar: string;
  /** `false` للتابع للمشتري (`HEA` · `EDU`) — الحدُّ المعلَن: يُعرف ولا يُعرض ولا يُقبل. */
  selectable: boolean;
}

/** الرمزُ الوحيد لفئة «خارج النطاق» — نصُّه حرٌّ يكتبه التاجر على كل حالة. */
export const OUT_OF_SCOPE_REASON_CODE = 'VATEX-SA-OOS';

/** حدّا نصّ «خارج النطاق» بعد قصّ الأطراف (`ق-١٢٢٢`) — كما في الخادم. */
export const OUT_OF_SCOPE_REASON_MIN = 3;
export const OUT_OF_SCOPE_REASON_MAX = 250;

/** قائمةُ الهيئة — الرموزُ ونصوصُها العربية من الجدول المصوَّر في المعيار، مرآةٌ لقائمة الخادم. */
export const EXEMPTION_REASONS: readonly ExemptionReasonOption[] = [
  { code: 'VATEX-SA-29', category: 'E', ar: 'الخدمات المالية', selectable: true },
  { code: 'VATEX-SA-29-7', category: 'E', ar: 'عقد تأمين على الحياة', selectable: true },
  { code: 'VATEX-SA-30', category: 'E', ar: 'التوريدات العقارية المعفاة من الضريبة', selectable: true },
  { code: 'VATEX-SA-32', category: 'Z', ar: 'صادرات السلع من المملكة', selectable: true },
  { code: 'VATEX-SA-33', category: 'Z', ar: 'صادرات الخدمات من المملكة', selectable: true },
  { code: 'VATEX-SA-34-1', category: 'Z', ar: 'النقل الدولي للسلع', selectable: true },
  { code: 'VATEX-SA-34-2', category: 'Z', ar: 'النقل الدولي للركاب', selectable: true },
  { code: 'VATEX-SA-34-3', category: 'Z', ar: 'الخدمات المرتبطة مباشرة أو عرضياً بتوريد النقل الدولي للركاب', selectable: true },
  { code: 'VATEX-SA-34-4', category: 'Z', ar: 'توريد وسائل النقل المؤهلة', selectable: true },
  { code: 'VATEX-SA-34-5', category: 'Z', ar: 'الخدمات ذات الصلة بنقل السلع أو الركاب (م٢٥ من اللائحة)', selectable: true },
  { code: 'VATEX-SA-35', category: 'Z', ar: 'الأدوية والمعدات الطبية', selectable: true },
  { code: 'VATEX-SA-36', category: 'Z', ar: 'المعادن المؤهلة', selectable: true },
  { code: 'VATEX-SA-EDU', category: 'Z', ar: 'الخدمات التعليمية الخاصة للمواطنين', selectable: false },
  { code: 'VATEX-SA-HEA', category: 'Z', ar: 'الخدمات الصحية الخاصة للمواطنين', selectable: false },
  { code: 'VATEX-SA-MLTRY', category: 'Z', ar: 'توريد السلع العسكرية المؤهلة', selectable: true },
  { code: OUT_OF_SCOPE_REASON_CODE, category: 'O', ar: 'خارج نطاق الضريبة — بسببٍ يكتبه المكلَّف لكل حالة', selectable: true },
];

/** الحدُّ المعلَن — يظهر في الشاشة لا في وثيقة (`ق-١٢٢٢`/①). */
export const BUYER_DEPENDENT_LIMIT = 'الفئاتُ التابعة للمشتري (الخدماتُ الصحية والتعليمية الخاصة للمواطنين — VATEX-SA-HEA · VATEX-SA-EDU) غيرُ مدعومة: تتبع هويّةَ المشتري لا الصنف، وتُحسم بعد الجلسة الميدانية.';

/** الأسبابُ التي تُعرض لفئةٍ — القابلةُ للاختيار وحدَها. */
export function selectableReasonsFor(category: 'Z' | 'E'): ExemptionReasonOption[] {
  return EXEMPTION_REASONS.filter((r) => r.category === category && r.selectable);
}

export function exemptionReasonLabel(code: string | null | undefined): string | null {
  const r = code ? EXEMPTION_REASONS.find((x) => x.code === code) : undefined;
  return r ? `${r.code} · ${r.ar}` : null;
}

/** النسبةُ مشتقّةٌ من الفئة — لا تُدخَل. */
export function rateForCategory(category: TaxCategory | null | undefined): number {
  return category === 'S' || category === 'LEGACY_STANDARD' ? STANDARD_VAT_RATE : 0;
}

/** ما يحمله سطرٌ بلا صنف قبل الإرسال — الفئةُ والسبب؛ والنسبةُ تُقرأ منهما. */
export interface LineTaxDraft {
  taxCategory: DeclarableTaxCategory;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

export const STANDARD_LINE_TAX: LineTaxDraft = { taxCategory: 'S' };

/**
 * الفئةُ المخزَّنة على سطرٍ قائم ⟵ مسوّدةٌ يُعاد إعلانُها: `LEGACY_STANDARD` تُقرأ `S` (استمرارٌ لا تصحيح)،
 * و`LEGACY_ZERO` **لا فئةَ لها** فتُعرض «معفى» بلا سبب حتى يختار التاجر — والخادمُ يرفضها بلا إعلان.
 */
export function draftTaxOf(l: { taxCategory: TaxCategory | null | undefined; taxExemptionReasonCode?: string | null; taxExemptionReason?: string | null }): LineTaxDraft {
  switch (l.taxCategory) {
    case 'S':
    case 'LEGACY_STANDARD':
      return { taxCategory: 'S' };
    case 'Z':
    case 'E':
      return { taxCategory: l.taxCategory, taxExemptionReasonCode: l.taxExemptionReasonCode ?? undefined };
    case 'O':
      return { taxCategory: 'O', taxExemptionReason: l.taxExemptionReason ?? undefined };
    default:
      return { taxCategory: 'E' };
  }
}

/** الفئةُ كما تُعرض في القائمة والشارة: `S · 15٪` · `Z · VATEX-SA-35` · «لم تُعلَن الفئة». */
export function taxBadgeOf(p: { taxCategory: TaxCategory | null | undefined; taxExemptionReasonCode?: string | null }): { text: string; undeclared: boolean } {
  switch (p.taxCategory) {
    case 'S':
      return { text: `S · ${STANDARD_VAT_RATE}٪`, undeclared: false };
    case 'Z':
    case 'E':
      return { text: `${p.taxCategory} · ${p.taxExemptionReasonCode ?? '—'}`, undeclared: false };
    case 'O':
      return { text: 'O · خارج النطاق', undeclared: false };
    default:
      return { text: 'لم تُعلَن الفئة — LEGACY_STANDARD', undeclared: true };
  }
}

/**
 * رسالةُ نقصٍ لمسوّدةٍ قبل الإرسال — نفسُ قواعد الخادم كي لا يُفاجَأ التاجر بـ`400`؛ والخادمُ هو الحكم.
 * `null` = سليمة.
 */
export function lineTaxDraftError(d: LineTaxDraft): string | null {
  if (d.taxCategory === 'S') return null;
  if (d.taxCategory === 'O') {
    const text = (d.taxExemptionReason ?? '').trim();
    if (!text) return 'فئةُ «خارج النطاق» تحتاج سببها نصّاً — يخرج للهيئة على كل حالة';
    if (text.length < OUT_OF_SCOPE_REASON_MIN || text.length > OUT_OF_SCOPE_REASON_MAX) return `سببُ «خارج النطاق» من ${OUT_OF_SCOPE_REASON_MIN} إلى ${OUT_OF_SCOPE_REASON_MAX} حرفاً بعد قصّ الأطراف`;
    return null;
  }
  const reason = EXEMPTION_REASONS.find((r) => r.code === d.taxExemptionReasonCode);
  if (!reason || reason.category !== d.taxCategory) return 'فئةُ نسبة الصفر أو المعفى تحتاج سببَ الإعفاء من قائمة الهيئة';
  if (!reason.selectable) return BUYER_DEPENDENT_LIMIT;
  return null;
}

/** ما يُرسَل للخادم من المسوّدة — الحقولُ الثلاثة بلا نسبة (الخادمُ يشتقّها). */
export function lineTaxPayload(d: LineTaxDraft): { taxCategory: DeclarableTaxCategory; taxExemptionReasonCode?: string; taxExemptionReason?: string } {
  if (d.taxCategory === 'S') return { taxCategory: 'S' };
  if (d.taxCategory === 'O') return { taxCategory: 'O', taxExemptionReasonCode: OUT_OF_SCOPE_REASON_CODE, taxExemptionReason: (d.taxExemptionReason ?? '').trim() };
  return { taxCategory: d.taxCategory, taxExemptionReasonCode: d.taxExemptionReasonCode };
}

/**
 * إعلانُ الصنف — الحقولُ الثلاثة **دائماً** و`null` لما لا ينطبق: الخادمُ يدمج ما لم يُرسَل مع القائم، فتغييرُ
 * `Z` إلى `S` بلا `null` صريحٍ على الرمز يُبقي رمزَ الإعفاء القديم ويُرفض «سببٌ على الأساسية».
 */
export function productTaxPayload(d: LineTaxDraft): { taxCategory: DeclarableTaxCategory; taxExemptionReasonCode: string | null; taxExemptionReason: string | null } {
  const p = lineTaxPayload(d);
  return { taxCategory: p.taxCategory, taxExemptionReasonCode: p.taxExemptionReasonCode ?? null, taxExemptionReason: p.taxExemptionReason ?? null };
}
