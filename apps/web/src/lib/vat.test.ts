import { describe, expect, it, vi } from 'vitest';
import {
  BUYER_DEPENDENT_LIMIT,
  draftTaxOf,
  EXEMPTION_REASONS,
  lineTaxDraftError,
  lineTaxPayload,
  OUT_OF_SCOPE_REASON_CODE,
  OUT_OF_SCOPE_REASON_MAX,
  productTaxPayload,
  rateForCategory,
  selectableReasonsFor,
  STANDARD_VAT_RATE,
  taxBadgeOf,
} from './vat';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.2 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * ⑧ مرآةُ قواعد الخادم في الواجهة (`line-tax.util.ts` · `exemption-reasons.ts`) — والقائمةُ نفسُها
 * تُطابَق نصّاً من جهة الخادم (`exemption-reasons.spec.ts`)، فهنا السلوكُ لا القائمة.
 */
describe('⑧ فئةُ الضريبة في الواجهة', () => {
  it('النسبةُ من الفئة لا من المُدخَل: S والقديمُ بالأساسية، وغيرُها صفر', () => {
    expect(rateForCategory('S')).toBe(STANDARD_VAT_RATE);
    expect(rateForCategory('LEGACY_STANDARD')).toBe(STANDARD_VAT_RATE);
    for (const c of ['Z', 'E', 'O', 'LEGACY_ZERO', null, undefined] as const) expect(rateForCategory(c)).toBe(0);
  });

  it('⛔ الحدُّ المعلَن: التابعُ للمشتري لا يُعرض في القوائم ولا يمرّ من الفحص', () => {
    const shown = [...selectableReasonsFor('Z'), ...selectableReasonsFor('E')].map((r) => r.code);
    expect(shown).not.toContain('VATEX-SA-HEA');
    expect(shown).not.toContain('VATEX-SA-EDU');
    expect(shown).toHaveLength(13);
    expect(EXEMPTION_REASONS).toHaveLength(16);
    expect(lineTaxDraftError({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-HEA' })).toBe(BUYER_DEPENDENT_LIMIT);
  });

  it('S بلا سبب · Z/E بسببٍ من فئته · O بنصٍّ مقيَّد — كقواعد الخادم', () => {
    expect(lineTaxDraftError({ taxCategory: 'S' })).toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'Z' })).not.toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-35' })).not.toBeNull(); // رمزُ Z على E
    expect(lineTaxDraftError({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' })).toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'O' })).not.toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'O', taxExemptionReason: '   ' })).not.toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'O', taxExemptionReason: ' ab ' })).not.toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'O', taxExemptionReason: 'x'.repeat(OUT_OF_SCOPE_REASON_MAX + 1) })).not.toBeNull();
    expect(lineTaxDraftError({ taxCategory: 'O', taxExemptionReason: ' رسومٌ حكومية ' })).toBeNull();
  });

  it('ما يُرسَل: بلا نسبة؛ وO يحمل رمزَه ونصَّه مقصوصاً؛ وإعلانُ الصنف يُرسل الثلاثةَ دائماً بـnull لما لا ينطبق', () => {
    expect(lineTaxPayload({ taxCategory: 'S' })).toEqual({ taxCategory: 'S' });
    expect(lineTaxPayload({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' })).toEqual({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' });
    expect(lineTaxPayload({ taxCategory: 'O', taxExemptionReason: ' سبب ' })).toEqual({ taxCategory: 'O', taxExemptionReasonCode: OUT_OF_SCOPE_REASON_CODE, taxExemptionReason: 'سبب' });
    expect(Object.keys(lineTaxPayload({ taxCategory: 'S' }))).not.toContain('taxRate');
    // تغييرُ Z إلى S على صنفٍ قائم: الخادمُ يدمج ما لم يُرسَل مع القائم، فالرمزُ يُصفَّر صراحةً.
    expect(productTaxPayload({ taxCategory: 'S' })).toEqual({ taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null });
    expect(productTaxPayload({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' })).toEqual({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29', taxExemptionReason: null });
  });

  it('القديمُ يُعلَن ولا يُصحَّح: الشارةُ «لم تُعلَن الفئة» للقائم، والمسوّدةُ من LEGACY_ZERO بلا فئةٍ جاهزة', () => {
    expect(taxBadgeOf({ taxCategory: 'LEGACY_STANDARD' })).toEqual({ text: 'لم تُعلَن الفئة — LEGACY_STANDARD', undeclared: true });
    expect(taxBadgeOf({ taxCategory: 'S' })).toEqual({ text: `S · ${STANDARD_VAT_RATE}٪`, undeclared: false });
    expect(taxBadgeOf({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' }).text).toBe('Z · VATEX-SA-35');
    expect(draftTaxOf({ taxCategory: 'LEGACY_STANDARD' })).toEqual({ taxCategory: 'S' });
    expect(draftTaxOf({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' })).toEqual({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' });
    expect(draftTaxOf({ taxCategory: 'O', taxExemptionReason: 'سبب' })).toEqual({ taxCategory: 'O', taxExemptionReason: 'سبب' });
    const fromLegacyZero = draftTaxOf({ taxCategory: 'LEGACY_ZERO' });
    expect(lineTaxDraftError(fromLegacyZero)).not.toBeNull();
  });
});
