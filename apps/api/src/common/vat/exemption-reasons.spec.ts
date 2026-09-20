import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EXEMPTION_REASONS, exemptionReasonByCode, OUT_OF_SCOPE_REASON_CODE, OUT_OF_SCOPE_REASON_MAX, OUT_OF_SCOPE_REASON_MIN } from './exemption-reasons';
import { lineTaxFromStored, rateForCategory, reasonCountByCategory, resolveDeclaredLineTax, resolveLineTax, validateDeclaredTax } from './line-tax.util';
import { STANDARD_VAT_RATE } from './standard-rate';
import { MSG } from '../i18n/messages';
import { readsDeclaredStrings } from '../source-scan.util';

// مرآةُ الواجهة أدناه تقرأ **بياناتٍ معلَنة داخل السلاسل** (رموزٌ ونصوصٌ) — فالنصُّ هو بياناتُها (`ق-٣٧٥`).
readsDeclaredStrings();

/**
 * ⑧ حارسُ قائمة الهيئة والفئة المشتقّة (`ق-١٢١٢` · `ق-١٢٢٢` · `ق-١٢٢٥`).
 *
 * القائمةُ تطابق معيارَ XML §11.2.4 عدّاً ورموزاً (`16` رمزاً: `3` لـ`E` · `12` لـ`Z` · `1` لـ`O`)،
 * والتابعُ للمشتري (`HEA` · `EDU`) معروفٌ **ولا يُعرض ولا يُقبل** — الحدُّ المعلَن. والنسبةُ من الفئة لا
 * من المُدخَل، وصفرٌ بلا فئةٍ غامضٌ فيُردّ، وسببُ `O` مقيَّدُ الطول ولا يُترك فراغاً.
 */
const bad = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof BadRequestException) return String((e.getResponse() as { message?: string }).message ?? e.message);
    throw e;
  }
  throw new Error('expected a BadRequestException');
};

describe('⑧ قائمةُ أسباب الإعفاء — كما في معيار XML §11.2.4', () => {
  it('⓪ القائمةُ تُقرأ فعلاً: ستّةَ عشرَ رمزاً بثلاث فئات — 3 معفاة · 12 نسبة صفر · 1 خارج النطاق', () => {
    expect(EXEMPTION_REASONS).toHaveLength(16);
    expect(reasonCountByCategory()).toEqual({ E: 3, Z: 12, O: 1 });
    expect(new Set(EXEMPTION_REASONS.map((r) => r.code)).size).toBe(16);
  });

  it('الرموزُ بأسمائها من الجدول المصوَّر — لا رمزَ من الذاكرة', () => {
    expect(EXEMPTION_REASONS.map((r) => r.code)).toEqual([
      'VATEX-SA-29', 'VATEX-SA-29-7', 'VATEX-SA-30',
      'VATEX-SA-32', 'VATEX-SA-33', 'VATEX-SA-34-1', 'VATEX-SA-34-2', 'VATEX-SA-34-3', 'VATEX-SA-34-4', 'VATEX-SA-34-5',
      'VATEX-SA-35', 'VATEX-SA-36', 'VATEX-SA-EDU', 'VATEX-SA-HEA', 'VATEX-SA-MLTRY',
      'VATEX-SA-OOS',
    ]);
    expect(exemptionReasonByCode('VATEX-SA-35')?.ar).toBe('الأدوية والمعدات الطبية');
    expect(exemptionReasonByCode('VATEX-SA-35')?.box).toBe(3);
    expect(exemptionReasonByCode('VATEX-SA-32')?.box).toBe(4);
    expect(exemptionReasonByCode('VATEX-SA-29')?.box).toBe(5);
    expect(exemptionReasonByCode(OUT_OF_SCOPE_REASON_CODE)?.box).toBeNull();
  });

  it('⛔ الحدُّ المعلَن: التابعُ للمشتري معروفٌ في القائمة ولا يُعرض ولا يُقبل، والخانةُ 2 لا تُدمَج في 3', () => {
    for (const code of ['VATEX-SA-EDU', 'VATEX-SA-HEA']) {
      expect(exemptionReasonByCode(code)?.selectable).toBe(false);
      expect(exemptionReasonByCode(code)?.box).toBe(2);
      expect(bad(() => validateDeclaredTax({ taxCategory: 'Z', taxExemptionReasonCode: code }))).toBe(MSG.tax_reason_code_unsupported);
    }
    expect(EXEMPTION_REASONS.filter((r) => r.selectable)).toHaveLength(14);
  });
});

describe('⑧ الفئةُ تُعلَن والنسبةُ تُشتقّ', () => {
  it('النسبةُ من الفئة: S والقديمُ بالأساسية من المصدر الواحد، وغيرُها صفر', () => {
    expect(rateForCategory('S')).toBe(STANDARD_VAT_RATE);
    expect(rateForCategory('LEGACY_STANDARD')).toBe(STANDARD_VAT_RATE);
    for (const c of ['Z', 'E', 'O', 'LEGACY_ZERO'] as const) expect(rateForCategory(c)).toBe(0);
  });

  it('S بلا سبب · Z/E بسببٍ من فئته · O بنصٍّ مقيَّد — والمخالفةُ مسمّاة', () => {
    expect(validateDeclaredTax({ taxCategory: 'S' })).toEqual({ taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null });
    expect(validateDeclaredTax({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' })).toEqual({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35', taxExemptionReason: null });
    expect(validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: '  رسومٌ حكومية تُحصَّل نيابةً  ' })).toEqual({ taxCategory: 'O', taxExemptionReasonCode: OUT_OF_SCOPE_REASON_CODE, taxExemptionReason: 'رسومٌ حكومية تُحصَّل نيابةً' });

    expect(bad(() => validateDeclaredTax({}))).toBe(MSG.tax_category_required);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'LEGACY_STANDARD' }))).toBe(MSG.tax_category_unknown);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'S', taxExemptionReasonCode: 'VATEX-SA-35' }))).toBe(MSG.tax_reason_forbidden_on_standard);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'Z' }))).toBe(MSG.tax_reason_code_required);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-99' }))).toBe(MSG.tax_reason_code_unknown);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-35' }))).toBe(MSG.tax_reason_code_mismatch);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35', taxExemptionReason: 'نصٌّ زائد' }))).toBe(MSG.tax_reason_text_forbidden);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'O', taxExemptionReasonCode: 'VATEX-SA-35', taxExemptionReason: 'سبب' }))).toBe(MSG.tax_reason_code_mismatch);
  });

  it('⚠️ سببُ خارج النطاق (ق-١٢٢٢): لا فراغَ ولا مسافاتٍ وحدَها، ومن ٣ إلى ٢٥٠ حرفاً بعد القصّ', () => {
    expect(bad(() => validateDeclaredTax({ taxCategory: 'O' }))).toBe(MSG.tax_reason_text_required);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: '   ' }))).toBe(MSG.tax_reason_text_required);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: ' ab ' }))).toBe(MSG.tax_reason_text_length);
    expect(bad(() => validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: 'x'.repeat(251) }))).toBe(MSG.tax_reason_text_length);
    expect(validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: 'abc' }).taxExemptionReason).toBe('abc');
    expect(validateDeclaredTax({ taxCategory: 'O', taxExemptionReason: 'x'.repeat(250) }).taxExemptionReason).toHaveLength(250);
  });

  it('سطرٌ بلا صنف: النسبةُ الأساسية وحدَها إعلانٌ لـS؛ وصفرٌ بلا فئةٍ غامضٌ يُردّ؛ والمتعارضان يُردّان', () => {
    expect(resolveDeclaredLineTax({ taxRate: STANDARD_VAT_RATE })).toEqual({ taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null, taxRate: STANDARD_VAT_RATE });
    expect(bad(() => resolveDeclaredLineTax({ taxRate: 0 }))).toBe(MSG.line_tax_category_required);
    expect(bad(() => resolveDeclaredLineTax({}))).toBe(MSG.line_tax_category_required);
    expect(bad(() => resolveDeclaredLineTax({ taxRate: 5 }))).toBe(MSG.line_tax_category_required);
    expect(bad(() => resolveDeclaredLineTax({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35', taxRate: STANDARD_VAT_RATE }))).toBe(MSG.line_tax_rate_conflict);
    expect(bad(() => resolveDeclaredLineTax({ taxCategory: 'S', taxRate: 0 }))).toBe(MSG.line_tax_rate_conflict);
    expect(resolveDeclaredLineTax({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29', taxRate: 0 }).taxRate).toBe(0);
  });

  it('سطرٌ بصنف: يرث بطاقتَه ويتجاهل ما يُرسَل معه (لا تجاوزَ على السطر)، وصنفٌ لا يُرى يُردّ باسمه', () => {
    const profiles = new Map([['p1', { taxCategory: 'Z' as const, taxExemptionReasonCode: 'VATEX-SA-35', taxExemptionReason: null }]]);
    expect(resolveLineTax({ productId: 'p1', taxCategory: 'S', taxRate: STANDARD_VAT_RATE }, profiles)).toEqual({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35', taxExemptionReason: null, taxRate: 0 });
    expect(bad(() => resolveLineTax({ productId: 'missing', taxRate: STANDARD_VAT_RATE }, profiles))).toBe(MSG.product_not_found);
  });

  it('النسخُ من سطرٍ مخزَّن: القديمُ بالأساسية يُنسخ كما هو، والقديمُ بصفرٍ لا يُنسخ إلى صفٍّ جديد', () => {
    expect(lineTaxFromStored({ taxCategory: 'LEGACY_STANDARD', taxExemptionReasonCode: null, taxExemptionReason: null })).toEqual({ taxCategory: 'LEGACY_STANDARD', taxExemptionReasonCode: null, taxExemptionReason: null, taxRate: STANDARD_VAT_RATE });
    expect(bad(() => lineTaxFromStored({ taxCategory: 'LEGACY_ZERO', taxExemptionReasonCode: null, taxExemptionReason: null }))).toBe(MSG.line_legacy_zero_needs_category);
  });
});

/**
 * ⑧ مرآةُ الواجهة (`apps/web/src/lib/vat.ts`): القائمةُ منسوخةٌ هناك بيدٍ بلا رابطٍ آليّ — فتُطابَق هنا رمزاً
 * وفئةً ونصّاً وقابليةً، وحدّا نصّ «خارج النطاق». والقراءةُ نصّية (لا يُستورد ملفُّ الواجهة في jest الخادم)
 * **فتُثبَت أولاً أنها رأت القائمةَ كاملة** (`16` صفّاً) قبل أن تُصدَّق المطابقة (`§8.7` — الحارسُ يقرأ شيئاً).
 */
describe('⑧ نسخةُ الواجهة تطابق قائمةَ الخادم', () => {
  const WEB_VAT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'lib', 'vat.ts');
  const source = readFileSync(WEB_VAT, 'utf8');

  it('الرموزُ والفئاتُ والنصوصُ والقابليةُ — صفّاً بصفّ وبالترتيب نفسِه', () => {
    const rowPattern = /\{ code: (?:'([^']+)'|(OUT_OF_SCOPE_REASON_CODE)), category: '([ZEO])', ar: '([^']*)', selectable: (true|false) \}/g;
    const rows = [...source.matchAll(rowPattern)].map((m) => ({ code: m[2] ? OUT_OF_SCOPE_REASON_CODE : m[1], category: m[3], ar: m[4], selectable: m[5] === 'true' }));
    expect(rows).toHaveLength(EXEMPTION_REASONS.length);
    expect(rows).toEqual(EXEMPTION_REASONS.map((r) => ({ code: r.code, category: r.category, ar: r.ar, selectable: r.selectable })));
  });

  it('رمزُ خارج النطاق وحدّا نصّه', () => {
    expect(source).toContain(`export const OUT_OF_SCOPE_REASON_CODE = '${OUT_OF_SCOPE_REASON_CODE}';`);
    expect(source).toContain(`export const OUT_OF_SCOPE_REASON_MIN = ${OUT_OF_SCOPE_REASON_MIN};`);
    expect(source).toContain(`export const OUT_OF_SCOPE_REASON_MAX = ${OUT_OF_SCOPE_REASON_MAX};`);
  });
});
