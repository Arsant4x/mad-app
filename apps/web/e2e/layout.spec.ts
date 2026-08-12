import { expect, test } from '@playwright/test';
import { loginThroughUi, readTestCompany, type TestCompany } from './fixtures';

/**
 * الاختبار ٥ — التخطيط عبر العروض الثلاثة. **في Playwright حصراً.**
 *
 * لا يجوز أن يُكتب في vitest مهما بدا مغرياً: jsdom **لا ينفّذ تخطيطاً** —
 * لا عرض عنصر ولا استعلام وسائط ولا تمرير. اختبارُ استجابةٍ فيه يمرّ دائماً
 * ولا يعني شيئاً، وهو أسوأ من غيابه لأنه يمنح طمأنينة كاذبة.
 *
 * ⚠️ **درسٌ دفعتُ ثمنه في هذا الملف نفسه:** نسختُه الأولى كانت تزور `/` وحدها
 * وتؤكّد ألّا تمرير أفقي. فحصتُها بالعكس — حقنتُ `min-width:1100px` في
 * `.app-shell` — **فمرّت الثلاثة**. السبب أن صفحة الدخول لا تُركّب `.app-shell`
 * أصلاً (هي خلف المصادقة في AppShell.tsx:127)، فالاختبار كان عاجزاً بنيوياً
 * عن رؤية ما يدّعي حراسته. ولذلك يسجّل هذا الملف منشأةً ويدخل فعلاً: **الحارس
 * يجب أن يقف حيث الخطر، لا حيث يسهل الوقوف.**
 *
 * ويحرس عطلاً قائماً الآن ولم يُصلَح بعد (أ٣): `.sidebar` عرضها 250px
 * بـ`flex-shrink:0` و`.app-shell` عليها `overflow:hidden` بلا نقطة توقّف
 * واحدة — فعلى شاشة 375px يتبقّى للمحتوى **125px** يُقصّ ولا يُمرَّر.
 */
test.describe('الاختبار ٥ — التخطيط لا يبتلع المحتوى', () => {
  let co: TestCompany | undefined;
  let hasApi = false;

  test.beforeAll(() => {
    // منشأة التشغيل الواحدة التي سجّلها globalSetup — ولا تسجيل هنا: ستّ
    // تسجيلات (مجموعتان × ثلاثة عروض) تتجاوز حدّ التسجيل 5/دقيقة فترتدّ
    // بـ429، والحدّ حارسٌ إنتاجيّ لا يُلتفّ عليه.
    const state = readTestCompany();
    hasApi = state.hasApi;
    co = state.hasApi ? (state as TestCompany) : undefined;
  });

  /**
   * تخطٍّ **صريح ومعلَّل** لا صامت: من يقرأ نتيجة السير يجب أن يعرف أن
   * الاختبار لم يُنفَّذ ولماذا — فتخطٍّ صامت يُقرأ نجاحاً وهو غياب.
   * ✅ لم يعد يقع في CI (صار فيه postgres + API)؛ يبقى للتشغيل المحلي بلا خادم.
   */
  const requireApi = () =>
    test.skip(!hasApi, 'لا API متاح في هذه البيئة — الاختبار يحتاج تسجيل منشأة حقيقية. (في CI يوجد API؛ فتخطٍّ هنا يعني عطل إقلاع لا نقص بنية)');

  test('صفحة الدخول تُعرض بلا تمرير أفقي', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'صفحة الدخول أوسع من الشاشة').toBeLessThanOrEqual(1);
  });

  test('viewport meta موجود — فالجوال يعرض بعرضه الحقيقي', async ({ page }) => {
    await page.goto('/');
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content ?? '', 'بلا viewport meta يعرض الجوال بعرضٍ وهمي 980px').toContain('width=device-width');
  });

  test('الهيكل بعد الدخول يترك للمحتوى مساحة صالحة', async ({ page }, testInfo) => {
    requireApi();
    await loginThroughUi(page, co!);

    const width = testInfo.project.use.viewport!.width;
    const usable = await page.evaluate(() => {
      const main = document.querySelector('.main-content') as HTMLElement | null;
      return main ? main.getBoundingClientRect().width : -1;
    });

    expect(usable, 'لا عنصر .main-content — تغيّر الهيكل').toBeGreaterThan(0);
    // النصف حدٌّ متسامح عمداً: الغرض إمساك «الشريط ابتلع الشاشة» لا فرض تصميم.
    // على 375px اليوم: 375 − 250 = 125px، أي ثلث الشاشة.
    expect(usable, `المحتوى ${Math.round(usable)}px من ${width}px — الشريط يبتلع الشاشة`).toBeGreaterThan(width * 0.5);
  });

  test('لا تمرير أفقي داخل التطبيق بعد الدخول', async ({ page }) => {
    requireApi();
    await loginThroughUi(page, co!);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'التطبيق أوسع من الشاشة').toBeLessThanOrEqual(1);
  });
});

/**
 * أ٣ — سلوك قائمة الجوال المنقول من النموذج: الزر يفتح، والتنقّل يغلق.
 *
 * يُنفَّذ على mobile-375 وحده: فوق 860px الزر مخفيٌّ بالتصميم، واختبارُ
 * سلوكٍ لا يظهر أصلاً توكيدٌ على لا شيء.
 */
test.describe('أ٣ — قائمة الجوال تفتح بالزر وتُغلق بالتنقّل', () => {
  let co: TestCompany | undefined;
  let hasApi = false;

  test.beforeAll(() => {
    const state = readTestCompany();
    hasApi = state.hasApi;
    co = state.hasApi ? (state as TestCompany) : undefined;
  });

  test('الزر يفتح الشريط، واختيار وجهةٍ يغلقه تلقائياً', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'الزر يظهر تحت 860px فقط');
    test.skip(!hasApi, 'لا API متاح في هذه البيئة. (في CI يوجد API؛ فتخطٍّ هنا يعني عطل إقلاع لا نقص بنية)');
    await loginThroughUi(page, co!);

    const sidebar = page.locator('.sidebar');
    const menuBtn = page.getByRole('button', { name: 'القائمة' });

    // مغلقة ابتداءً: الشريط خارج الشاشة فلا يتقاطع مع العرض.
    // ⚠️ الاتجاه يتبع اللغة: في RTL يخرج **يميناً** (‎right:-290px ⇒ x ≥ العرض)،
    // وفي LTR يخرج يساراً (‎left:-290px ⇒ x+width ≤ 0). توكيدٌ يفترض جهةً
    // واحدة يسقط على الاتجاه الآخر بلا أن يكون في الشيفرة عطل — وهو ما وقع
    // في أول صياغة لهذا الاختبار.
    const width = testInfo.project.use.viewport!.width;
    const off = await sidebar.boundingBox();
    expect(off, 'الشريط غير مركَّب').not.toBeNull();
    const offScreen = off!.x >= width - 1 || off!.x + off!.width <= 1;
    expect(offScreen, `الشريط ظاهر قبل فتح القائمة (x=${Math.round(off!.x)}, w=${Math.round(off!.width)})`).toBe(true);

    await menuBtn.click();
    await expect(page.locator('.app-shell.mobile-menu-open')).toHaveCount(1);
    // مفتوحة: الشريط داخل الشاشة الآن — تُقاس بـ**نسبة الجزء المتقاطع مع
    // الشاشة** لا بمجموع `x + width`.
    //
    // ⚠️ الصيغة السابقة (`x + width > 100`) كانت **خاملة في RTL**: الشريط
    // المغلق يقف عند x=395 بعرض 270، فمجموعه 665 — أي أنه يمرّ التوكيد وهو
    // مغلق، بهامشٍ أوسع مما يمرّه وهو مفتوح (375). صيغت للحالة LTR وحدها
    // (مغلق: ‎-290+270 = -20)، وهو الفخّ الذي يحذّر منه تعليق الحالة المغلقة
    // أعلاه بنصّه — ووقعنا فيه في الطرف الآخر من الاختبار نفسه.
    //
    // ومع ذلك **لم يكن الاختبار يمرّ على الكسر**: كان يسقط بعد ذلك عند نقر
    // `.sidebar nav a` بمهلة 60 ثانية ورسالة `locator.click: Test timeout`
    // — سقوطٌ صحيح برسالةٍ مضلِّلة تُخفي السبب. فقيمة هذا التوكيد تشخيصية:
    // يسقط فوراً وباسم العطل، لا بعد دقيقةٍ وباسم غيره.
    //
    // والنسبة تعمل في الاتجاهين معاً: خارج الشاشة يميناً أو يساراً ⇒ 0.
    await expect
      .poll(async () => {
        const b = await sidebar.boundingBox();
        if (!b || b.width === 0) return 0;
        const visible = Math.min(b.x + b.width, width) - Math.max(b.x, 0);
        return Math.max(0, visible) / b.width;
      }, { message: 'الشريط لم ينزلق إلى الشاشة' })
      .toBeGreaterThan(0.9);

    // التنقّل يغلقها — نظير goTo() في النموذج.
    await page.locator('.sidebar nav a').first().click();
    await expect(page.locator('.app-shell.mobile-menu-open'), 'القائمة بقيت مفتوحة بعد التنقّل').toHaveCount(0);
  });
});
