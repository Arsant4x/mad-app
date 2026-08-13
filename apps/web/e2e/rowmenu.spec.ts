import { expect, Page, test } from '@playwright/test';
import { sharedSession } from './fixtures';

/**
 * حارس `RowMenu` — المكوّن الذي تستعمله **عشرون شاشة**، فعطلٌ فيه يظهر
 * «في كل الشاشات» لا في واحدة.
 *
 * يحرس عطلين مقيسين، لا فرضيتين:
 *
 * ١. **التراكب:** كانت كل قائمة تُغلق بمستمعٍ على `document`، بينما `toggle`
 *    يستدعي `stopPropagation()`. وفي React 19 يُربط المستمع بجذر التطبيق،
 *    فالحدث يتوقف قبل `document` ⇒ قائمة الصف الأول لا تُغلق حين يُفتح
 *    الثاني ⇒ قائمتان مفتوحتان بنفس `z-index:500`.
 *
 * ٢. **الانفصال بالتمرير:** القائمة `position:fixed` بإحداثيات تُحسب لحظة
 *    الفتح وحدها، فالتمرير يترك الصفَّ يتحرك والقائمةَ ثابتة حتى تصير معلّقة
 *    فوق صفٍّ آخر.
 *
 * تُشغَّل على «دليل الحسابات» لأن كل منشأة جديدة تُنشأ بدليل افتراضي (18
 * حساباً) — صفوفٌ حقيقية بلا تهيئة وبلا اعتمادٍ على بيانات سابقة.
 */
test.describe('RowMenu — قائمة الصف مشتركة بين عشرين شاشة', () => {
  /**
   * جلسةٌ واحدة للمجموعة — **والدخول كان في `beforeEach`**.
   *
   * وهو الفخّ بعينه الذي كلّفنا يوماً كاملاً: دخولٌ في `beforeEach` **يتضاعف
   * بعدد الاختبارات صامتاً**. اختباران اليوم ⇒ محاولتان؛ ومن يضيف ثالثاً غداً
   * يدفع ثالثة بلا أن يرى في الملف رقماً يتغيّر. و`POST /auth/login` محدودٌ
   * بعشرٍ في الدقيقة **لكل IP**، وعدّاء السير واحد للعروض الثلاثة.
   *
   * ⚠️ و`onlyProject` لازمٌ لا تحسين: `beforeAll` يعمل لكل عرض، فمجموعةٌ
   * تُتخطّى على عرضين تدفع مع ذلك ثمن الدخول فيهما.
   */
  const session = sharedSession({ onlyProject: 'desktop-1280' });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'سلوك القائمة مستقل عن العرض — عرضٌ واحد يكفي');
    test.skip(!session.hasApi(), 'لا API متاح في هذه البيئة. (في CI يوجد API؛ فتخطٍّ هنا يعني عطل إقلاع لا نقص بنية)');
    const page = session.page();

    // إعادة تهيئة الحالة بين اختبارَين يتقاسمان الصفحة: قائمةٌ بقيت مفتوحة
    // أو تمريرٌ لم يُرجَع يجعل الثاني يقيس أثر الأول.
    //
    // ⚠️ **تنقّلٌ داخل التطبيق لا `goto`**: رمز الوصول في الذاكرة، وإعادة
    // تحميل كاملة تُسقط الجلسة إلى مسار التجديد وتجعل الاختبار يقيس شيئاً
    // آخر. فالخروج والعودة بنقرتين يُعيد تركيب الشاشة نظيفةً بلا مساس
    // بالجلسة — وهو ما كان يفعله الدخول المتكرّر بثمنٍ أغلى.
    await page.getByRole('link', { name: 'لوحة التحكم' }).click();
    await page.getByRole('link', { name: 'دليل الحسابات' }).click();
    await expect(page.locator('.menu-btn').first()).toBeVisible();
  });

  test('فتح قائمة صفٍّ ثم صفٍّ آخر يترك واحدة مفتوحة فقط', async () => {
    const page = session.page();
    const buttons = page.locator('.menu-btn');
    expect(await buttons.count(), 'تحتاج الشاشة صفَّين على الأقل').toBeGreaterThan(1);

    await buttons.nth(0).click();
    await expect(page.locator('.action-menu')).toHaveCount(1);

    await buttons.nth(1).click();
    // ⚠️ هنا كان العطل: الأولى تبقى مفتوحة فتصير القيمة 2.
    await expect(page.locator('.action-menu'), 'قائمتان مفتوحتان معاً — التراكب بعينه').toHaveCount(1);
  });

  test('التمرير لا يفصل القائمة عن صفّها', async () => {
    const page = session.page();
    await page.locator('.menu-btn').first().click();
    const menu = page.locator('.action-menu');
    await expect(menu).toHaveCount(1);

    const before = await geometry(page);
    expect(before.gap, 'القائمة لا تلتصق بزرّها ابتداءً').toBeLessThan(12);

    const moved = await scrollRowsBy(page, 240);
    // شرطُ صحّة الاختبار نفسه: إن لم يتحرك الزر فلا شيء يُقاس، والتوكيد
    // التالي يمرّ بلا معنى — وهو بالضبط الحارس الذي يقف حيث لا خطر.
    expect(moved, 'لم يتحرك الصفّ بالتمرير — الاختبار لا يقيس شيئاً').toBeGreaterThan(20);

    if ((await menu.count()) === 0) return; // خرج الزر من الشاشة ⇒ الإغلاق سلوكٌ صحيح

    const after = await geometry(page);
    // ⚠️ هنا كان العطل: الفجوة تكبر بمقدار التمرير كله فتنفصل القائمة.
    expect(after.gap, `القائمة انفصلت عن صفّها بعد تمرير ${Math.round(moved)}px (الفجوة ${Math.round(after.gap)}px)`).toBeLessThan(12);
  });
});

/** الفجوة الرأسية بين أسفل الزر وأعلى القائمة، وموضع الزر المطلق. */
async function geometry(page: Page): Promise<{ gap: number; btnTop: number }> {
  return page.evaluate(() => {
    const btn = document.querySelector('.menu-btn');
    const menu = document.querySelector('.action-menu');
    const btnTop = btn ? btn.getBoundingClientRect().top : Number.NaN;
    if (!btn || !menu) return { gap: Number.POSITIVE_INFINITY, btnTop };
    return { gap: Math.abs(menu.getBoundingClientRect().top - btn.getBoundingClientRect().bottom), btnTop };
  });
}

/**
 * يمرّر الحاوية التي تُمرَّر فعلاً ويعيد **إزاحة الزر المقيسة** لا المطلوبة.
 *
 * فوق 860px الهيكل `height:100vh; overflow:hidden` والتمرير يقع داخل
 * `.main-content` لا على النافذة — فتمريرٌ على `window` لا يحرّك شيئاً،
 * ويجعل الاختبار يمرّ بلا أن يمرّر.
 */
async function scrollRowsBy(page: Page, amount: number): Promise<number> {
  return page.evaluate((by) => {
    const btn = document.querySelector('.menu-btn');
    const topBefore = btn ? btn.getBoundingClientRect().top : 0;
    const candidates = [document.querySelector('.main-content'), document.scrollingElement, document.body];
    for (const el of candidates) {
      if (!el) continue;
      if (el.scrollHeight - el.clientHeight > by) {
        el.scrollTop += by;
        break;
      }
    }
    const topAfter = btn ? btn.getBoundingClientRect().top : 0;
    return Math.abs(topBefore - topAfter);
  }, amount);
}
