import { expect, test } from '@playwright/test';
import { readTestCompany, sharedSession } from './fixtures';

/**
 * التفويض — **حدود الخادم كما يراها متجاوِز**.
 *
 * ⚠️ والقاعدة التي يحرسها الاثنان: **إخفاء الزر ليس منعاً.** الطلب فيهما
 * يُصنع بـ`request` لا بنقرة — أي بلا مرورٍ بأي زر ولا بأي ترشيحٍ بصري —
 * وهو بالضبط ما يفعله من يحاول التجاوز. ونجاحُ أيٍّ منهما يعني أن ترشيح
 * الشجرة كان كل الحماية.
 *
 * ✅ **وتوكيدُ الصفحة عاد** بعد تحرير ميزانية الدخول: كان محجوباً بحدّ
 * `POST /auth/login` (عشرٌ في الدقيقة لكل IP)، وسقط مرّتين بـ
 * `ThrottlerException` قبل أن يُصلَح السبب في `layout.spec.ts` — انظر
 * `sharedSession` في `fixtures.ts`.
 */

const co = readTestCompany();
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.describe('التفويض — شجرةً وسجلاً', () => {
  test.skip(!co.hasApi, 'يتطلّب خادماً حيّاً — تخطٍّ صريح لا صامت');

  // عرضٌ واحد ⇒ دخولٌ واحد للتشغيل كله لا ثلاثة.
  const session = sharedSession({ onlyProject: 'desktop-1280' });

  /**
   * ⚠️ على `desktop-1280` وحده — **وليس تقليلاً للتغطية**.
   *
   * ما يُقاس هنا تركيبُ الصفحة مقابل خادمٍ حيّ، وهو **مستقلٌّ عن العرض**
   * تماماً: لا استعلام وسائط ولا نقطة توقّف في هذه الشاشة. فتشغيله على
   * ثلاثة أعراض يشتري صفر معلومةٍ إضافية بثلاثة أضعاف الدخول — والدخول هو
   * المورد النادر هنا (عشرٌ في الدقيقة لكل IP).
   *
   * وهو نفس منطق `nginx-cache`: عرضٌ واحد حين لا يغيّر العرض النتيجة.
   */
  test('سجل التفويض يُفتح فارغاً، والمدخل من الموظف لا من شاشة مستقلة', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'تركيب الصفحة مستقل عن العرض — عرضٌ واحد يكفي');
    const page = session.page();
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
