import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): نمطُه **يطلب علاماتِ الاقتباس
// صراحةً** — `['"\`]${code}['"\`]` — فهو يبحث عن الرمز **داخل سلسلة**.
// **وتجريدُ النصوص يجعله لا يطابق شيئاً أبداً.**
readsDeclaredStrings();
import { taxPathOf, WRITEOFF_REASONS, writeOffReason, type TaxPath } from './writeoff-reasons';

/**
 * **المسار الضريبي يُعلَن ولا يُورَث** (قرار المالك 2026-09-04).
 *
 * أسباب الشطب مساران متعاكسان، وخلطهما **يُنتج إقراراً خاطئاً بلا عَرَضٍ ظاهر**.
 * فالحارس يثبت ثلاثة: أن كل رمزٍ يعلن مساره · وأن المجهول **يرمي ولا يستقرّ** ·
 * وأن **شيفرة الترحيل لا تقرّر المسار بنفسها** — فلو قرّرته لعاد الرمز الجديد
 * يرث الفرع الافتراضي بصمت.
 */
describe('رموز شطب المخزون — المسار الضريبي في التعريف', () => {
  it('كل رمزٍ يعلن مساره وسنده، ولا رمز بلا أحدهما', () => {
    for (const r of WRITEOFF_REASONS) {
      expect(`${r.code}: ${r.taxPath}`).toMatch(/: (NO_ADJUSTMENT|DEEMED_SUPPLY)$/);
      expect(r.source.length).toBeGreaterThan(20);
      expect(r.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('والمساران كلاهما ممثَّل — فقائمةٌ بمسارٍ واحد تعني أن الثاني نُسي', () => {
    const paths = new Set<TaxPath>(WRITEOFF_REASONS.map((r) => r.taxPath));
    expect([...paths].sort()).toEqual(['DEEMED_SUPPLY', 'NO_ADJUSTMENT']);
  });

  it('🔴 التلف والفقد والسرقة والإتلاف ضمن النشاط: لا تعديل — وهو عكس ما تفعله أنظمة ERP', () => {
    for (const code of ['DAMAGE', 'LOSS', 'THEFT', 'BUSINESS_DESTRUCTION']) {
      expect(`${code} ⇒ ${taxPathOf(code)}`).toBe(`${code} ⇒ NO_ADJUSTMENT`);
    }
  });

  it('🔴 والاستخدام الشخصي والهدايا فوق الحدّ والخروج عن النشاط: توريدٌ اعتباري', () => {
    for (const code of ['PERSONAL_USE', 'NON_BUSINESS_USE', 'GIFT_ABOVE_LIMIT', 'DEREGISTRATION_RETENTION']) {
      expect(`${code} ⇒ ${taxPathOf(code)}`).toBe(`${code} ⇒ DEEMED_SUPPLY`);
    }
  });

  it('🔴 ورمزٌ مجهول يرمي ولا يستقرّ على افتراضي — فالمستقرّ يصنّف بالصمت', () => {
    expect(() => taxPathOf('SOMETHING_NEW')).toThrow(RangeError);
    expect(() => taxPathOf('')).toThrow(RangeError);
    expect(writeOffReason('SOMETHING_NEW')).toBeNull();
    expect(writeOffReason(null)).toBeNull();
  });

  it('والمسافات لا تقرّر شيئاً — كما في فئات المشتريات', () => {
    expect(writeOffReason(' DAMAGE ')?.code).toBe('DAMAGE');
  });

  it('والكاشير لا يقرّر أياً منها — كلّها تشترط مراجعة', () => {
    expect(WRITEOFF_REASONS.filter((r) => !r.requiresReview)).toEqual([]);
  });

  it('🔴 وشيفرة الترحيل لا تقرّر المسار بنفسها — تقرأه من التعريف', () => {
    // ⚠️ يقرأ **المصدر** لا المخرَج: مقارنةُ رمزٍ بنصّه داخل شيفرة الترحيل تعني
    // أن رمزاً جديداً يقع في الفرع الافتراضي **بصمت** — وهو ما وقع فعلاً في
    // خريطة فئات المشتريات: أربع فئاتٍ معروضة بلا مدخل، رُحِّلت كلها للمستقرّ.
    const postingPath = join(__dirname, '..', 'journal', 'auto-posting.util.ts');
    const source = readFileSync(postingPath, 'utf8');
    expect(source.length).toBeGreaterThan(1000); // توكيدُ سلامة: قراءةٌ فاشلة تُسقط لا تمرّ

    const offenders = WRITEOFF_REASONS.map((r) => r.code).filter((code) => new RegExp(`['"\`]${code}['"\`]`).test(source));
    expect(offenders).toEqual([]);
  });
});
