import { round2 } from '../money/rounding';

/**
 * ⑥A1 (`ق-١٣٢٥` · `ق-٨٢١` · `ق-٨٢٢` · `ق-٨٢٤`) — **الخصمُ النسبيّ لضريبة المدخلات.**
 *
 * **النصّ** (اللائحةُ التنفيذية م٥١، والقراءةُ مسجَّلةٌ في `docs/licensing-and-operations.md`):
 *   م٥١/١–٣ · ما نُسب **حصراً ومباشرةً** للخاضع ⟵ كاملاً · وللمعفى ⟵ لا شيء ·
 *            والمشتركُ أو ما لا يُنسب مستقلاً ⟵ **بالنسبة**.
 *   م٥١/٤–٥ · البسطُ **خاضعُ السنة التقويمية الماضية**، والمقامُ **الخاضعُ والمعفى** منها؛
 *            و**يُستبعَد** توريدُ الأصول الرأسمالية.
 *   م٥١/٦–٧ · من لا سنةَ ماضيةَ له ⟵ **القيمُ المقدَّرة للسنة الحالية**، ثم **مقارنةٌ بالفعليّ
 *            وتعديلٌ في الإقرار الأخير من السنة**.
 *
 * ⛔ **ولا حدَّ تافه** (`ق-٨٢٢`/④ — نفيٌ بمسبارٍ مُصادَق على النصّ الرسميّ): لا نسبةَ يُغتفر
 * دونها، فلا رايةَ «نسبةٌ مهمَلة» هنا.
 *
 * ⚠️ **والنسبةُ تُضرب في المشترك وحدَه** لا في ضريبة المدخلات كلِّها — وهو أشيعُ ما يُخطأ فيه.
 */

export type InputVatBucket = 'TAXABLE_ONLY' | 'EXEMPT_ONLY' | 'MIXED' | 'LEGACY_UNASSIGNED';

/** ضريبةُ المدخلات مقسومةً على الأكياس الثلاثة — و«ما سبق البناء» يقف مع المشترك. */
export interface InputVatBuckets {
  taxableOnly: number;
  exemptOnly: number;
  /** المشتركُ المُعلَن. */
  mixed: number;
  /** ما سبق البناء (`LEGACY_UNASSIGNED`) — **يُعامَل معاملةَ المشترك ويُعدّ على حدة**. */
  legacyUnassigned: number;
  legacyCount: number;
}

export interface ProportionalOutcome {
  /** ما يُخصم فعلاً في الإقرار. */
  deductible: number;
  /** ما لا يُخصم — يُعلَن ولا يُخفى. */
  nonDeductible: number;
  /** الوعاءُ الذي ضُربت فيه النسبة (المشتركُ + ما سبق البناء). */
  apportionedBase: number;
  /** حصّةُ الوعاء المخصومة. */
  apportionedDeductible: number;
}

/**
 * **الكسرُ** (م٥١/٤): خاضعٌ ÷ (خاضعٌ + معفى).
 *
 * و«الخاضع» يشمل **الخاضعَ بالنسبة الأساسية وبنسبة الصفر** معاً — كلاهما توريدٌ خاضع
 * في القسمة، والصفرُ نسبةٌ لا إعفاء.
 *
 * ⚠️ **ومقامٌ صفرٌ ليس نسبةَ صفر**: منشأةٌ بلا توريداتٍ أصلاً **لا نسبةَ لها** — تُعاد
 * `null` ولا يُخترع لها رقم. (ولو أُعيدت `0` لصار كلُّ مدخلٍ مشتركٍ غيرَ قابلٍ للخصم.)
 */
export function proportionalRatio(taxableSupplies: number, exemptSupplies: number): number | null {
  const denominator = taxableSupplies + exemptSupplies;
  if (denominator <= 0) return null;
  // ستُّ خاناتٍ — كما يخزّنها العمود، فلا تفترق النسبةُ المحسوبة عن المخزَّنة.
  return Math.round((taxableSupplies / denominator) * 1_000_000) / 1_000_000;
}

/**
 * يطبّق النسبةَ على الأكياس. **والمنسوبُ حصراً لا تمسّه النسبة** — لا في اتجاهٍ ولا في آخر.
 *
 * ⚠️ **وغيرُ المخصوم يُحسب بالطرح لا بضربٍ ثانٍ**: `base − apportionedDeductible` — فلا
 * تبقى هللةٌ بين الشقّين مهما كانت النسبة (وهي قاعدةُ `ق-١١٤٦` نفسُها في التكاليف المحمَّلة).
 */
export function applyProportionalDeduction(buckets: InputVatBuckets, ratio: number): ProportionalOutcome {
  const apportionedBase = round2(buckets.mixed + buckets.legacyUnassigned);
  const apportionedDeductible = round2(apportionedBase * ratio);
  const deductible = round2(buckets.taxableOnly + apportionedDeductible);
  const nonDeductible = round2(buckets.exemptOnly + (apportionedBase - apportionedDeductible));
  return { deductible, nonDeductible, apportionedBase, apportionedDeductible };
}

/**
 * **تسويةُ آخر فترةٍ من السنة** (م٥١/٧): يُقارَن ما طُبِّق بما تقوله توريداتُ السنة الفعلية،
 * **ويُعدَّل الفرقُ في الإقرار الأخير**.
 *
 * والفرقُ موجبٌ حين تكون النسبةُ الفعلية أعلى من المطبَّقة (خُصم أقلُّ مما يحقّ ⟵ يُستردّ
 * المزيد)، وسالبٌ في العكس.
 */
export function annualSettlement(appliedRatio: number, actualRatio: number, yearApportionedBase: number): { difference: number; actualDeductible: number; appliedDeductible: number } {
  const appliedDeductible = round2(yearApportionedBase * appliedRatio);
  const actualDeductible = round2(yearApportionedBase * actualRatio);
  return { difference: round2(actualDeductible - appliedDeductible), actualDeductible, appliedDeductible };
}
