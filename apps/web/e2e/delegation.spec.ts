import { expect, test } from '@playwright/test';
import { loginThroughUi, readTestCompany } from './fixtures';

/**
 * شجرة التفويض وسجلّه — **في متصفّح حقيقي**.
 *
 * وما يُثبَت هنا لا يُثبَت في jsdom: أن الصفحة تُركَّب فعلاً من جواب خادمٍ
 * حيّ، وأن الرابط في الشريط يقود إلى صفحةٍ لا ترفض حامله. فتطابقُ حارس
 * الواجهة مع حارس الخادم لا يظهر إلا بمرورٍ كامل عبر الاثنين.
 *
 * ⚠️ **والقاعدة التي يحرسها الاختباران الأخيران: إخفاء الزر ليس منعاً.**
 * الطلب فيهما يُصنع بـ`request` لا بنقرة — أي بلا مرورٍ بأي زر — وهو
 * بالضبط ما يفعله من يحاول التجاوز. ونجاحُه يعني أن الترشيح البصري كان كل
 * الحماية.
 */

const co = readTestCompany();
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.describe('التفويض — شجرةً وسجلاً', () => {
  test.skip(!co.hasApi, 'يتطلّب خادماً حيّاً — تخطٍّ صريح لا صامت');

  /**
   * ⚠️ **دخولٌ واحد لكل عرض — والسبب حدٌّ أمني لا بطء.**
   *
   * `POST /auth/login` محدودٌ بعشر محاولات في الدقيقة لكل IP
   * (`auth.controller.ts`) — «سخيّة لإنسان وعديمة النفع لسكربت تخمين».
   * وعدّاء السير يُشغّل العروض الثلاثة من IP واحد، فمجموع الدخول في
   * الحزمة كلها هو ما يبلغ السقف لا عدد اختباراتي.
   *
   * كتبتُ أول صياغة بدخولين، فسقط `desktop-1280` وحده (آخر العروض) بـ
   * `ThrottlerException: Too Many Requests` مكتوبةً في الصفحة. والمظهر كان
   * مهلةً على `.app-shell` — أي **عَرَضاً لا سبباً**، وهو بعينه ما حذّر منه
   * تعليق `fixtures.ts`: لا تُرفع المهلة، يُفحص هل نجح الطلب أصلاً.
   *
   * فالتوكيدان مدموجان في جلسةٍ واحدة: لا أحدهما يحتاج جلسةً خاصة.
   * ولا يُرفع الحدّ ولا يُتخطّى — حارسٌ يُعطَّل للاختبار ليس حارساً.
   */
  test('سجل التفويض يُفتح فارغاً، والمدخل من الموظف لا من شاشة مستقلة', async ({ page }) => {
    await loginThroughUi(page, co as Parameters<typeof loginThroughUi>[1]);
    await page.goto('/delegation-log');

    // منشأةٌ جديدة بلا تفويض: **رسالةٌ صريحة لا جدولٌ فارغ بلا تفسير**.
    await expect(page.getByTestId('log-empty')).toBeVisible({ timeout: 15_000 });
    // ولا تحذير فجوةٍ كاذب على سجلٍّ فارغ.
    await expect(page.getByTestId('sequence-break')).toHaveCount(0);

    // ولا شاشة تفويض مستقلة في الشريط: المدخل من الموظف — وهو ما يجعل
    // السؤال «لمن؟» مُجاباً قبل طرحه.
    await expect(page.locator('nav a[href="/delegations"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="/delegation-log"]')).toHaveCount(1);
  });

  test('⭐ إخفاء الزر ليس منعاً — الخادم يرفض ما لا تعرضه الشجرة', async ({ request }) => {
    // طلبٌ **مصنوع بيد** بمفردةٍ لا تنتجها الشجرة إطلاقاً (`invoices` اسمٌ
    // مخترَع ليس في `ALLOWED_SCREENS`). ولو قبله الخادم لكان الترشيح
    // البصري كل الحماية.
    const res = await request.post(`${API}/delegations`, {
      headers: { Authorization: `Bearer ${co.token}` },
      data: { granteeId: co.companyId, nodeKey: 'invoices', grants: ['invoices:view'] },
      failOnStatusCode: false,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('⭐ بلا رمز دخول لا يُقرأ السجل ولا يُكتب فيه', async ({ request }) => {
    const readRes = await request.get(`${API}/delegations/log`, { failOnStatusCode: false });
    expect(readRes.status()).toBe(401);

    const writeRes = await request.post(`${API}/delegations`, {
      data: { granteeId: 'x', nodeKey: 'root', grants: ['contracts:view'] },
      failOnStatusCode: false,
    });
    expect(writeRes.status()).toBe(401);
  });
});
