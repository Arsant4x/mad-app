import { expect, test } from '@playwright/test';

/**
 * الاختبار ٦ — تحديث الصفحة على مسار عميق يبقيها تعمل.
 *
 * يحرس نصف العطل الأول: مسارات العميل تعيش في المتصفح، والخادم لا يعرف
 * `/invoices` كملف. بلا احتياطي SPA يردّ 404 على كل تحديث أو رابط محفوظ —
 * وهو ما يبدو للمستخدم «الصفحة تعطّلت» بلا فرق ظاهر عن انهيار مكوّن.
 *
 * (السبب الفعلي في الإنتاج كان التخزين المؤقت لا الاحتياطي — لكن العَرَض
 * واحد، والاثنان يستحقان حارساً.)
 */
const DEEP_ROUTES = ['/invoices', '/customers', '/contracts', '/properties', '/reports'];

test.describe('الاختبار ٦ — المسارات العميقة تصمد للتحديث', () => {
  for (const route of DEEP_ROUTES) {
    test(`تحميل ${route} مباشرةً يُقدّم التطبيق لا 404`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status(), `${route} لم يُقدَّم`).toBe(200);
      expect(res?.headers()['content-type']).toContain('text/html');
      // غير مسجَّل دخول ⇒ يُعاد إلى شاشة الدخول. المهم أن التطبيق **ركّب**،
      // لا أن المسار عُرض — فالتوجيه سلوكٌ صحيح لا عطل.
      await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible();
    });
  }

  test('مسار لا وجود له يُقدّم التطبيق كذلك (لا 404 من الخادم)', async ({ page }) => {
    const res = await page.goto('/no/such/route');
    expect(res?.status()).toBe(200);
  });

  test('لا خطأ JavaScript غير ملتقَط عند الإقلاع', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible();
    // حاجز الأخطاء يمسك أخطاء العرض؛ هذا يمسك ما يفلت منه.
    expect(errors, `أخطاء غير ملتقَطة: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
