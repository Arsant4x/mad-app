import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): يستخرج رموزَ الحسابات بـ
// `/'(\d{4})'/` — **من داخل السلاسل نفسها**، **فتجريدُ النصوص يعيده بصفر
// رمزٍ فيمرّ عمىً** (وحدُّه الأدنى المكتوب أدناه يمنع ذلك، لكنّ الإعلان أصدق).
readsDeclaredStrings();
import {
  FX_DIFFERENCE_ACCOUNT,
  KEY_MONEY_ASSET_ACCOUNT,
  MAINTENANCE_EXPENSE_ACCOUNT,
  OTHER_INCOME_ACCOUNT,
  purchaseExpenseAccountCode,
  TENANT_DEPOSITS_ACCOUNT,
} from '../journal/auto-posting.util';
import { PURCHASE_CATEGORIES } from '../common/purchase-categories';
import { OPENING_EQUITY_CODE } from '../journal/opening-balance.util';
import { DEFAULT_CHART, DEFAULT_CHART_CODES } from './default-chart';

/**
 * الحارس الحقيقي لهذه الوحدة: **قائمة الدليل تُقاس بالترحيل، لا بالنية.**
 *
 * إن أضاف أحدهم مساراً يرحّل على حساب جديد ونسي إدراجه هنا، فالعطل الناتج صامت
 * تماماً — المستند يُحفظ ولا يُرحَّل. فهذا الاختبار يشتقّ ما يحتاجه الترحيل من
 * auto-posting.util.ts نفسه ويسقط عند أول رمز ناقص، بدل أن ينكشف الأمر في
 * دفترٍ فارغٍ عند عميل.
 *
 * طبقتان لأن الرموز تسكن ثلاثة أشكال مختلفة في ذلك الملف:
 *   (أ) ثوابت مُصدَّرة وخريطة فئات المشتريات — تُشتقّ من **الكود نفسه**،
 *       فيلتقطها المترجم إن أُعيدت تسميتها.
 *   (ب) حرفيات نصية داخل مصفوفات needCodes لا تُصدَّر — تُقرأ من المصدر نصاً.
 * الطبقة (ب) هشّة بطبعها، فمعها توكيدُ سلامةٍ صريح: قراءة فاشلة تُسقِط
 * الاختبار ولا تمرّ فارغة — توكيدٌ بلا بيانات أسوأ من غيابه.
 */
describe('الدليل الافتراضي يغطي كل ما يرحّل عليه النظام', () => {
  it('(أ) يغطي كل ثابت حساب مُصدَّر من auto-posting', () => {
    const exported = {
      FX_DIFFERENCE_ACCOUNT,
      TENANT_DEPOSITS_ACCOUNT,
      OTHER_INCOME_ACCOUNT,
      KEY_MONEY_ASSET_ACCOUNT,
      MAINTENANCE_EXPENSE_ACCOUNT,
      OPENING_EQUITY_CODE,
    };
    for (const [name, code] of Object.entries(exported)) {
      expect(`${name}=${code} موجود: ${DEFAULT_CHART_CODES.has(code)}`).toBe(`${name}=${code} موجود: true`);
    }
  });

  it('(أ) يغطي كل مستقرّ لخريطة فئات المشتريات — بما فيها فئة مجهولة', () => {
    // الفئات **تُقرأ من مصدرها** لا تُكتب هنا — قائمةٌ منسوخة تجعل الحارس يحرس
    // نسخته لا النظام. واللافتات القديمة تُضاف صراحةً لأنها لم تعد في المصدر
    // المعروض؛ والفئة المجهولة تُثبت أن المستقرّ (5300) موجود هو الآخر.
    const categories: (string | null | undefined)[] = [
      ...PURCHASE_CATEGORIES.map((c) => c.code),
      ...PURCHASE_CATEGORIES.map((c) => c.label),
      'رواتب وأجور',
      'مواد خام',
      'بضاعة',
      'فئة لا وجود لها',
      '',
      null,
      undefined,
    ];
    const resolved = new Set(categories.map((c) => purchaseExpenseAccountCode(c)));
    expect(resolved.size).toBeGreaterThanOrEqual(5); // 5100..5500
    const missing = [...resolved].filter((code) => !DEFAULT_CHART_CODES.has(code));
    expect(missing).toEqual([]);
  });

  it('(ب) يغطي كل رمز حساب مذكور نصاً حيث تُكتب رموز الترحيل', () => {
    // ⚠️ السطح **ملفّان**، لا ملفٌّ واحد. خريطة فئات الشراء خرجت من
    // `auto-posting.util.ts` إلى مصدرها الواحد، فسقط عدُّ الرموز هنا تحت الحدّ
    // الأدنى — **وهذا ما بُني له الحدّ**. فحين ينتقل المصدر ينتقل معه سطح
    // الحارس، وإلا حرس نصف ما يظنّ أنه يحرسه (`§8.7`).
    const sources = [
      { path: join(__dirname, '..', 'journal', 'auto-posting.util.ts'), must: 'resolveAccountIds' },
      { path: join(__dirname, '..', 'common', 'purchase-categories.ts'), must: 'PURCHASE_CATEGORIES' },
      // ⚠️ والملفّان التاليان **ثقبٌ كان قائماً**: رموز المخزون وضريبة المدخلات
      // خرجت إلى `inventory-accounts.util.ts` وحساب التلف وُلد في ملفه، **ولم
      // ينتقل سطح الحارس معها** — وهي العلّة نفسها التي وثّقها التعليق أعلاه.
      { path: join(__dirname, '..', 'journal', 'inventory-accounts.util.ts'), must: 'INVENTORY_ACCOUNT_CODE' },
      { path: join(__dirname, '..', 'journal', 'writeoff-account.util.ts'), must: 'WRITEOFF_EXPENSE_ACCOUNT_CODE' },
    ];

    // توكيد السلامة أولاً: ملف مفقود أو أُعيدت تسميته يجب أن يُسقط الاختبار
    // صراحةً. بدونه يقرأ الاختبار فراغاً، فلا يجد رمزاً ناقصاً، فيمرّ — وهو
    // أسوأ من عدم وجوده أصلاً لأنه يمنح طمأنينة كاذبة.
    const source = sources
      .map((s) => {
        const text = readFileSync(s.path, 'utf8');
        expect(text.length).toBeGreaterThan(500);
        expect(text).toContain(s.must);
        return text;
      })
      .join('\n');

    const codes = [...new Set([...source.matchAll(/'(\d{4})'/g)].map((m) => m[1]))].sort();
    // الترحيل اليوم يمسّ 19 رمزاً (كانت 16 قبل ضمّ ملفَّي الحسابات المُنشأة عند
    // الحاجة). الحدّ الأدنى يحرس ضد تغيير صياغة يجعل النمط لا يلتقط شيئاً
    // (رموز مبنية ديناميكياً مثلاً) فيمرّ الاختبار فارغاً.
    expect(codes.length).toBeGreaterThanOrEqual(19);

    const missing = codes.filter((code) => !DEFAULT_CHART_CODES.has(code));
    expect({ missing, checked: codes.length }).toEqual({ missing: [], checked: codes.length });
  });

  it('[SPEC 3.1] لا رمز مكرر، ولكل حساب نوع صالح', () => {
    expect(DEFAULT_CHART_CODES.size).toBe(DEFAULT_CHART.length);
    const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    for (const a of DEFAULT_CHART) {
      expect(`${a.code} ${a.type}`).toBe(`${a.code} ${validTypes.includes(a.type) ? a.type : 'نوع غير صالح'}`);
      expect(a.name.trim().length).toBeGreaterThan(0);
    }
  });
});
