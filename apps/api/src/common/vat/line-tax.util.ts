import { BadRequestException } from '@nestjs/common';
import type { Prisma, TaxCategory } from '@mad-app/db';
import { MSG } from '../i18n/messages';
import { EXEMPTION_REASONS, exemptionReasonByCode, OUT_OF_SCOPE_REASON_CODE, OUT_OF_SCOPE_REASON_MAX, OUT_OF_SCOPE_REASON_MIN } from './exemption-reasons';
import { STANDARD_VAT_RATE } from './standard-rate';

type Tx = Prisma.TransactionClient;

/**
 * ⑧ فئةُ الضريبة على السطر — **تُنسخ من الصنف لحظةَ البيع أو تُعلَن على سطرٍ بلا صنف، ولا تُخمَّن**
 * (`ق-١٢١١` · `ق-١٢١٢` · `ق-١٢٢٥`).
 *
 * ثلاثةُ مداخلَ لا مدخل:
 * · **سطرٌ يحمل صنفاً** يرث الثلاثة (الفئة · رمزُ السبب · نصُّه) من بطاقته **ويتجاهل ما يُرسَل معه** —
 *   لا تجاوزَ على السطر (`ق-١٢١١`/②). وصنفٌ لم يُعلَن (`LEGACY_STANDARD`) يُورَث كما هو: استمرارٌ لا
 *   تصحيح، يُرَنّ بالنسبة الأساسية ويُعدّ في الإقرار «بيعٌ بقيمةٍ قديمة».
 * · **سطرٌ بلا صنف** (خدمةٌ حرّة) يُلزَم بالفئة والسبب (`ق-١٢١١`/③)؛ و`taxRate` وحدَه يُقبل **إعلاناً لـ`S`**
 *   حين يساوي النسبةَ الأساسية — فالأربعةُ والأربعون ملفَّ اختبارٍ لا تُمسّ — وصفرٌ بلا فئةٍ يُردّ `400`
 *   مسمّىً: غامضٌ بين ثلاث فئات.
 * · **نسخٌ من سطرٍ مخزَّن** (بدلٌ عن مردودة · إشعارٌ دائن أو مدين · تحويلُ عرض) يُوثَق كما كُتب — فالإشعارُ
 *   يعكس ما فُوتر لا ما على البطاقة اليوم؛ و`LEGACY_ZERO` لا يُنسخ إلى صفٍّ جديد (القيدُ يحبسه) فيُردّ باسمه.
 *
 * والنسبةُ **مشتقّةٌ** من الفئة من المصدر الواحد — لا تُقرأ من المُدخَل إلا للمطابقة.
 */

export type TaxCategoryCode = TaxCategory;

export interface LineTax {
  taxCategory: TaxCategoryCode;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
  /** نسبةٌ مئوية مشتقّة — `STANDARD_VAT_RATE` لـ`S`/`LEGACY_STANDARD` وصفرٌ لغيرها. */
  taxRate: number;
}

/** ما يصل من العميل على السطر (أو على بطاقة الصنف) — كلُّه اختياريٌّ في الشكل، والقاعدةُ تحكم. */
export interface DeclaredTaxInput {
  taxCategory?: string | null;
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
  taxRate?: number | null;
}

/** الفئاتُ التي يُعلنها التاجر — القيمتان القديمتان لا تُعلَنان بيدٍ أبداً. */
export const DECLARABLE_TAX_CATEGORIES: readonly TaxCategoryCode[] = ['S', 'Z', 'E', 'O'];

export function rateForCategory(category: TaxCategoryCode): number {
  return category === 'S' || category === 'LEGACY_STANDARD' ? STANDARD_VAT_RATE : 0;
}

/** الفئةُ كما تخرج للهيئة: `LEGACY_STANDARD` هو `S` بعينه (كان يُرَنّ بالنسبة الأساسية)؛ و`LEGACY_ZERO` لا يخرج. */
export function renderedCategory(category: TaxCategoryCode): 'S' | 'Z' | 'E' | 'O' | 'LEGACY_ZERO' {
  return category === 'LEGACY_STANDARD' ? 'S' : category;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * الفئةُ والسبب كما يُعلنهما التاجر — على بطاقة الصنف أو على سطرٍ بلا صنف. تُطبَّق القواعدُ نفسُها التي
 * تحبسها قيودُ `CHECK` في القاعدة، برسائلَ مسمّاة: سببٌ من القائمة إلزاميٌّ لـ`Z`/`E` ومن فئته؛ و`O` بنصٍّ
 * من ٣ إلى ٢٥٠ حرفاً بعد القصّ (`ق-١٢٢٢`)؛ ولا سببَ على `S`؛ والتابعُ للمشتري يُردّ باسمه (الحدُّ المعلَن).
 */
export function validateDeclaredTax(input: Omit<DeclaredTaxInput, 'taxRate'>): Omit<LineTax, 'taxRate'> {
  const category = normalizeText(input.taxCategory);
  if (!category) throw new BadRequestException(MSG.tax_category_required);
  if (!DECLARABLE_TAX_CATEGORIES.includes(category as TaxCategoryCode)) throw new BadRequestException(MSG.tax_category_unknown);
  const code = normalizeText(input.taxExemptionReasonCode);
  const text = normalizeText(input.taxExemptionReason);

  if (category === 'S') {
    if (code || text) throw new BadRequestException(MSG.tax_reason_forbidden_on_standard);
    return { taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null };
  }
  if (category === 'O') {
    if (code && code !== OUT_OF_SCOPE_REASON_CODE) throw new BadRequestException(MSG.tax_reason_code_mismatch);
    if (!text) throw new BadRequestException(MSG.tax_reason_text_required);
    if (text.length < OUT_OF_SCOPE_REASON_MIN || text.length > OUT_OF_SCOPE_REASON_MAX) throw new BadRequestException(MSG.tax_reason_text_length);
    return { taxCategory: 'O', taxExemptionReasonCode: OUT_OF_SCOPE_REASON_CODE, taxExemptionReason: text };
  }
  // Z · E — الرمزُ من القائمة ومن الفئة نفسِها، ولا نصَّ حرّاً (نصُّ الرمز يُشتقّ من القائمة عند الإصدار).
  if (!code) throw new BadRequestException(MSG.tax_reason_code_required);
  const reason = exemptionReasonByCode(code);
  if (!reason) throw new BadRequestException(MSG.tax_reason_code_unknown);
  if (reason.category !== category) throw new BadRequestException(MSG.tax_reason_code_mismatch);
  if (!reason.selectable) throw new BadRequestException(MSG.tax_reason_code_unsupported);
  if (text) throw new BadRequestException(MSG.tax_reason_text_forbidden);
  return { taxCategory: category as TaxCategoryCode, taxExemptionReasonCode: reason.code, taxExemptionReason: null };
}

/**
 * سطرٌ بلا صنف: الفئةُ معلَنةً — أو `taxRate` وحدَه مساوياً النسبةَ الأساسية إعلاناً لـ`S`. والاثنان معاً
 * يُطابَقان: `S` مع الأساسية وغيرُها مع الصفر، وإلا `400` مسمّى — مُدخَلٌ يقول شيئين لا يُختار له أحدُهما.
 */
export function resolveDeclaredLineTax(input: DeclaredTaxInput): LineTax {
  const hasCategory = normalizeText(input.taxCategory) !== null;
  const rate = typeof input.taxRate === 'number' ? input.taxRate : null;
  if (!hasCategory) {
    if (rate === STANDARD_VAT_RATE) return { taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null, taxRate: STANDARD_VAT_RATE };
    throw new BadRequestException(MSG.line_tax_category_required);
  }
  const declared = validateDeclaredTax(input);
  const derived = rateForCategory(declared.taxCategory);
  if (rate !== null && rate !== derived) throw new BadRequestException(MSG.line_tax_rate_conflict);
  return { ...declared, taxRate: derived };
}

export interface ProductTaxProfile {
  taxCategory: TaxCategoryCode;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
}

/** خريطةُ `productId → فئتُه` لأصناف السطور المعطاة — داخل معاملة المستأجر فتراها RLS. */
export async function productTaxFor(tx: Tx, lines: readonly { productId?: string | null }[]): Promise<Map<string, ProductTaxProfile>> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return new Map();
  const products = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } });
  return new Map(products.map((p) => [p.id, { taxCategory: p.taxCategory, taxExemptionReasonCode: p.taxExemptionReasonCode, taxExemptionReason: p.taxExemptionReason }]));
}

/** سطرٌ من العميل: صنفُه يحكم إن وُجد، وإلا إعلانُه. صنفٌ لا يُرى (غيرُ موجود أو لمنشأةٍ أخرى) يُردّ باسمه. */
export function resolveLineTax(line: DeclaredTaxInput & { productId?: string | null }, profiles: ReadonlyMap<string, ProductTaxProfile>): LineTax {
  if (line.productId) {
    const profile = profiles.get(line.productId);
    if (!profile) throw new BadRequestException(MSG.product_not_found);
    return { ...profile, taxRate: rateForCategory(profile.taxCategory) };
  }
  return resolveDeclaredLineTax(line);
}

/** يحلّ سطورَ مستندٍ كاملاً بقراءةٍ واحدة لأصنافها. */
export async function resolveLineTaxes<L extends DeclaredTaxInput & { productId?: string | null }>(tx: Tx, lines: readonly L[]): Promise<LineTax[]> {
  const profiles = await productTaxFor(tx, lines);
  return lines.map((l) => resolveLineTax(l, profiles));
}

/**
 * نسخٌ موثوق من سطرٍ مخزَّن — الإشعارُ والبدلُ يعكسان **ما فُوتر**، والتحويلُ ينقل **ما عُرض**؛ لا ما على
 * البطاقة اليوم. و`LEGACY_ZERO` لا يُكتب في صفٍّ جديد (القيدُ يحبسه على ما سبق الهجرة) فيُردّ باسمه:
 * يُعلن التاجرُ فئتَه على العرض قبل تحويله، وفاتورةٌ قديمة بصفرٍ تُصحَّح بإشعارٍ ومستندٍ جديد.
 */
export function lineTaxFromStored(stored: ProductTaxProfile): LineTax {
  if (!stored.taxCategory) throw new BadRequestException(MSG.tax_category_required);
  if (stored.taxCategory === 'LEGACY_ZERO') throw new BadRequestException(MSG.line_legacy_zero_needs_category);
  return {
    taxCategory: stored.taxCategory,
    taxExemptionReasonCode: stored.taxExemptionReasonCode ?? null,
    taxExemptionReason: stored.taxExemptionReason ?? null,
    taxRate: rateForCategory(stored.taxCategory),
  };
}

/** النصُّ الذي يخرج للهيئة في `cbc:TaxExemptionReason`: نصُّ `O` الحرّ، أو النصُّ العربي للرمز من القائمة. */
export function exemptionReasonText(tax: Pick<LineTax, 'taxExemptionReasonCode' | 'taxExemptionReason'>): string | null {
  if (tax.taxExemptionReason) return tax.taxExemptionReason;
  return exemptionReasonByCode(tax.taxExemptionReasonCode)?.ar ?? null;
}

/** للحرّاس: عددُ رموز القائمة لكل فئة — يُقرأ من القائمة لا يُكتب. */
export function reasonCountByCategory(): Record<'Z' | 'E' | 'O', number> {
  return EXEMPTION_REASONS.reduce((acc, r) => ({ ...acc, [r.category]: acc[r.category] + 1 }), { Z: 0, E: 0, O: 0 });
}
