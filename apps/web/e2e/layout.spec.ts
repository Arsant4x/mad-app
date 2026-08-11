import { expect, test } from '@playwright/test';
import { apiReachable, deleteCompany, loginThroughUi, registerCompany, type TestCompany } from './fixtures';

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

  test.beforeAll(async ({ request }) => {
    hasApi = await apiReachable(request);
    if (hasApi) co = await registerCompany(request, 'layout');
  });

  test.afterAll(async ({ request }) => {
    if (co) await deleteCompany(request, co.companyId);
  });

  /**
   * تخطٍّ **صريح ومعلَّل** لا صامت: من يقرأ نتيجة السير يجب أن يعرف أن
   * الاختبار لم يُنفَّذ ولماذا — فتخطٍّ صامت يُقرأ نجاحاً وهو غياب.
   * ⏳ يزول بإضافة postgres + API إلى السير قبل 2026-08-17.
   */
  const requireApi = () =>
    test.skip(!hasApi, 'لا API متاح في هذه البيئة (CI بلا postgres بعد) — الاختبار يحتاج تسجيل منشأة حقيقية. بند متابعة: يُضاف قبل 2026-08-17');

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
