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

  test('سجل التفويض يُفتح ويقول إنه فارغ — لا جدولٌ فارغ بلا تفسير', async ({ page }) => {
    await loginThroughUi(page, co as Parameters<typeof loginThroughUi>[1]);
    await page.goto('/delegation-log');
    await expect(page.getByTestId('log-empty')).toBeVisible({ timeout: 15_000 });
    // ولا تحذير فجوةٍ كاذب على سجلٍّ فارغ.
    await expect(page.getByTestId('sequence-break')).toHaveCount(0);
  });

  test('المدخل من الموظف لا من شاشة مستقلة', async ({ page }) => {
    await loginThroughUi(page, co as Parameters<typeof loginThroughUi>[1]);
    await page.goto('/company-users');
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15_000 });
    // لا شاشة تفويض مستقلة في الشريط: المدخل من الموظف — وهو ما يجعل
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
