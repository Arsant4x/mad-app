import { ALLOWED_SCREENS, SCREEN_ACTIONS } from '../templates/screens';
import { allGrants, buildTree, expand, RAW_DOMAINS, screensUnder } from './permission-tree';

/**
 * حارس الشجرة المشتقّة.
 *
 * **الحادثة التي وُلد منها (2026-08-12):** كُتبت خريطة النطاقات من مسارات
 * الشريط الجانبي (`/units` · `/invoices` · `/audit-log`) لا من
 * `ALLOWED_SCREENS`. **خمسة عشر اسماً لا وجود لها** — والمرشِّح
 * (`.filter(includes)`) كان يبتلعها **صامتاً**، فتُنتج شجرةً ناقصة تبدو
 * سليمة. الأسماء الحقيقية أخشن: `invoice` لا `invoices`، و`inventory`
 * بدل ثلاث شاشات مخزون، و`audit` لا `audit-log`.
 *
 * فالحارس يفحص **الاتجاهين**:
 *   • لا شاشة حقيقية مفقودة من الشجرة (وإلا تعذّر تفويضها).
 *   • ولا اسم في الشجرة بلا شاشة حقيقية (وإلا كذبت الشجرة على قارئها).
 *
 * وهو ما يجعل الشجرة **عرضاً للسجلّ القائم لا سجلاً ثانياً**: تُضاف شاشة إلى
 * `ALLOWED_SCREENS` ⇒ يسقط هذا الاختبار حتى تُسنَد.
 */
describe('شجرة النطاقات — مشتقّة لا مكتوبة', () => {
  /**
   * ⚠️ **يُقرأ من `RAW_DOMAINS` لا من `buildTree()`.**
   *
   * `buildTree` يُرشِّح ما ليس في `ALLOWED_SCREENS`، فقراءة مخرَجه تعني
   * قراءة نصٍّ **بعد تنقيته من الخطأ المبحوث عنه**. وأول صياغة لهذا الحارس
   * قرأت `buildTree()` — فأُعيد الاسم المخترَع `invoices` إلى الخريطة
   * **ومرّت الاختبارات السبعة كلها**. الحارس كان يفحص عمله لا مصدره.
   */
  const declared = () => RAW_DOMAINS.flatMap((d) => d.screens);

  it('كل شاشة حقيقية مُسنَدة إلى نطاق — لا شاشة يتعذّر تفويضها', () => {
    const missing = (ALLOWED_SCREENS as readonly string[]).filter((s) => !declared().includes(s));
    expect({ شاشات_خارج_الشجرة: missing }).toEqual({ شاشات_خارج_الشجرة: [] });
  });

  it('⚠️ لا اسم في الخريطة بلا شاشة حقيقية — الاسم المخترَع يُبتلع صامتاً', () => {
    const ghosts = declared().filter((s) => !(ALLOWED_SCREENS as readonly string[]).includes(s));
    expect({ أسماء_لا_وجود_لها: ghosts }).toEqual({ أسماء_لا_وجود_لها: [] });
  });

  it('لا تكرار: شاشة واحدة في نطاق واحد', () => {
    const seen = new Set<string>();
    const dupes = declared().filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
    expect({ شاشات_مكررة: dupes }).toEqual({ شاشات_مكررة: [] });
  });

  it('الجذر يعني كل الشاشات، والعقدة الورقية شاشتها وحدها', () => {
    expect(screensUnder('root')).toHaveLength(ALLOWED_SCREENS.length);
    expect(screensUnder('contracts')).toEqual(['contracts']);
    expect(screensUnder('لا-وجود-له')).toEqual([]);
  });

  it('النطاق يوسّع إلى أزواج شاشاته × أفعاله — لا أكثر', () => {
    const realestate = buildTree().find((d) => d.key === 'realestate')!;
    const out = expand('realestate', ['view', 'edit']);
    expect(out.size).toBe(realestate.screens.length * 2);
    expect(out.has('contracts:view')).toBe(true);
    // ولا يتسرّب فعلٌ لم يُمنح، ولا شاشةٌ خارج النطاق.
    expect(out.has('contracts:delete')).toBe(false);
    expect(out.has('accounts:view')).toBe(false);
  });

  it('المصفوفة الكاملة = الشاشات × الأفعال (القياس المسجَّل: 24×7=168)', () => {
    expect(allGrants().size).toBe(ALLOWED_SCREENS.length * SCREEN_ACTIONS.length);
  });

  it('لا نظام صلاحيات ثانٍ — المفردات هي `screens.ts` نفسها', () => {
    for (const g of allGrants()) {
      const [screen, action] = g.split(':');
      expect(ALLOWED_SCREENS as readonly string[]).toContain(screen);
      expect(SCREEN_ACTIONS as readonly string[]).toContain(action);
    }
  });
});
