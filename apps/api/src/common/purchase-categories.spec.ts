import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AMORTIZABLE_CATEGORY,
  DEFAULT_EXPENSE_ACCOUNT,
  PURCHASE_CATEGORIES,
  purchaseExpenseAccountCode,
  toPurchaseCategoryCode,
} from './purchase-categories';

/**
 * **ما تعرضه الواجهة هو ما يعرفه الدفتر — في الاتجاهين.**
 *
 * كانت قائمتان مستقلّتان بلافتاتٍ عربية: قائمة الواجهة وخريطة الحسابات. فأربعُ
 * فئاتٍ معروضة (كهرباء · مياه · اتصالات وإنترنت · إيجار) **بلا مدخلٍ في الخريطة
 * إطلاقاً** فترحَّل ضمناً إلى المستقرّ، وثلاثةُ مداخل في الخريطة **لا تعرضها
 * الواجهة قطّ**. ولا شيء كان يقيس التفاوت.
 *
 * والحارس يقرأ **مصدر الواجهة من القرص**، لا نسخةً منه هنا — فنسخةٌ في الحارس
 * تجعله يحرس نفسه.
 */
describe('فئات المشتريات — مصدرٌ واحد', () => {
  const modalPath = join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'suppliers', 'PurchaseModal.tsx');

  /** يقرأ رموز الواجهة من مصفوفة `CATEGORY_CODES` في مصدر الشاشة نفسه. */
  function uiCodes(): string[] {
    const src = readFileSync(modalPath, 'utf8');
    const m = /const CATEGORY_CODES\s*=\s*\[([^\]]*)\]/.exec(src);
    if (!m) throw new Error(`لم تُقرأ CATEGORY_CODES من ${modalPath} — تغيّر شكلها يعمي الحارس`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }

  it('المجسّ يقرأ فعلاً — لا مصفوفةً فارغة تُقرأ نجاحاً', () => {
    expect(uiCodes().length).toBeGreaterThan(0);
  });

  it('كل رمزٍ تعرضه الواجهة معروفٌ للدفتر', () => {
    const known = new Set(PURCHASE_CATEGORIES.map((c) => c.code));
    expect(uiCodes().filter((c) => !known.has(c))).toEqual([]);
  });

  it('وكل رمزٍ يعرفه الدفتر تعرضه الواجهة — فلا مدخلٌ ميت', () => {
    const shown = new Set(uiCodes());
    expect(PURCHASE_CATEGORIES.map((c) => c.code).filter((c) => !shown.has(c))).toEqual([]);
  });

  it('لكل فئةٍ حسابٌ صريح — ولا واحدة تصل إلى المستقرّ ضمناً', () => {
    for (const c of PURCHASE_CATEGORIES) {
      expect(purchaseExpenseAccountCode(c.code)).toBe(c.account);
      expect(c.account).toMatch(/^5\d{3}$/);
    }
  });

  it('المسافة لم تعد تقرّر مصير فاتورة', () => {
    const formation = PURCHASE_CATEGORIES.find((c) => c.code === AMORTIZABLE_CATEGORY)!;
    for (const written of [formation.label, ` ${formation.label} `, `${formation.label}\t`, AMORTIZABLE_CATEGORY]) {
      expect(toPurchaseCategoryCode(written)).toBe(AMORTIZABLE_CATEGORY);
      expect(purchaseExpenseAccountCode(written)).toBe(formation.account);
    }
  });

  it('لافتاتٌ قديمة لا تعرضها الواجهة تبقى مقروءة — وإسقاطها يرحّل صفوفها إلى المستقرّ', () => {
    expect(toPurchaseCategoryCode('رواتب وأجور')).toBe('SALARIES');
    expect(toPurchaseCategoryCode('مواد خام')).toBe('COGS');
    expect(toPurchaseCategoryCode('بضاعة')).toBe('COGS');
  });

  it('وفئةٌ حرّة كتبها التاجر تقع على المستقرّ — وهو الموضع الوحيد المشروع له', () => {
    expect(toPurchaseCategoryCode('نثريات المكتب')).toBeNull();
    expect(purchaseExpenseAccountCode('نثريات المكتب')).toBe(DEFAULT_EXPENSE_ACCOUNT);
    expect(purchaseExpenseAccountCode(null)).toBe(DEFAULT_EXPENSE_ACCOUNT);
  });
});
