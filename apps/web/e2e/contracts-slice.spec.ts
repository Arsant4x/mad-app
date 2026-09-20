import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readTestCompany, sharedSession, type TestCompany } from './fixtures';

/**
 * الشريطُ الرفيع — قائمةُ العقود وبطاقةُ العقد **على الخادم فعلاً** (`docs/ui/rounds/03`).
 *
 * يُثبت في المتصفح ما لا تثبته وحداتُ jsdom (لا تخطيطَ فيها):
 * - الحالاتُ من `Resource` لا من طول المصفوفة: **سقوطُ الخادم يُعرض خطأً لا «لا عقود بعد»** (②).
 * - **لا تمريرَ أفقيّاً** في المقاسات الثلاثة، والصفُّ **مصفوفٌ بسطرين** عند 375 (قرار المالك).
 * - الأعمدةُ بالقياس: عند 1280 يدخل ٨ من ٩ وعند 768 ٥ من ٩ — والباقي في البطاقة.
 * - البطاقةُ تقرأ الأقساطَ من الخادم بلا مجموع (①).
 *
 * ⚠️ **حدٌّ معلَن**: لوحةُ إعلان التصنيف تحتاج عقداً بقيمةٍ قديمة (`LEGACY_*`) ولا يُنشأ
 * مثلُه عبر المسارات (الخادمُ يرفضها لصفٍّ جديد — `contract-classification.e2e-spec.ts`)،
 * فتُختبر هنا اللوحةُ بوحداتٍ محاكيةٍ للخطّاف (`ClassificationDeclaration.test.tsx`)،
 * والرفضُ الخادميّ يُثبته اختبارُ الخادم نفسُه.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

async function seedContract(request: APIRequestContext, co: TestCompany): Promise<{ no: string }> {
  const headers = { Authorization: `Bearer ${co.token}` };
  const stamp = Date.now();
  const property = await request.post(`${API}/properties`, { headers, data: { name: `برج الاختبار ${stamp}`, ownership: 'owned', activityType: 'residential' } });
  expect(property.status(), await property.text()).toBe(201);
  const propertyId = (await property.json()).id as string;
  const unit = await request.post(`${API}/units`, { headers, data: { propertyId, unitNo: `A-${stamp % 1000}`, type: 'شقة', rentMonthly: 2500 } });
  expect(unit.status(), await unit.text()).toBe(201);
  const unitId = (await unit.json()).id as string;
  const customer = await request.post(`${API}/customers`, { headers, data: { name: `مستأجر الاختبار ${stamp}`, phone: '0500000000' } });
  expect(customer.status(), await customer.text()).toBe(201);
  const customerId = (await customer.json()).id as string;
  const year = new Date().getUTCFullYear();
  const contract = await request.post(`${API}/contracts`, {
    headers,
    data: { unitId, customerId, value: 30000, cycle: 'quarterly', start: `${year}-01-01`, end: `${year}-12-31`, deposit: 5000, classification: 'RESIDENTIAL', vatInclusion: 'INCLUSIVE' },
  });
  expect(contract.status(), await contract.text()).toBe(201);
  return { no: (await contract.json()).no as string };
}

async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll, `تمريرٌ أفقيّ: scrollWidth ${m.scroll} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client);
}

test.describe('الشريطُ الرفيع — قائمة العقود وبطاقة العقد على الخادم', () => {
  const session = sharedSession();
  const state = readTestCompany();
  test.skip(!state.hasApi, 'لا خادم — تخطٍّ معلَن (يعمل في السير بقاعدةٍ حيّة)');

  test('① منشأةٌ جديدة: الفارغُ أوّلَ مرّة — لا رأسَ جدول ولا فلتر، وفعلٌ واحد', async () => {
    const page = session.page();
    await page.goto('/contracts');
    const wrap = page.locator('.rz-table-wrap');
    await expect(wrap).toHaveAttribute('data-status', /empty|ready/);
    if ((await wrap.getAttribute('data-status')) === 'empty') {
      await expect(page.locator('[data-state="empty-first"]')).toBeVisible();
      await expect(page.getByText('لا عقود بعد')).toBeVisible();
    }
    await noHorizontalScroll(page);
  });

  test('② سقوطُ الخادم يُعرض خطأً برقم الطلب — لا «لا عقود بعد»', async () => {
    const page = session.page();
    await page.route('**/contracts?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'عطلٌ مصطنع للاختبار' }) }));
    await page.goto('/contracts');
    await expect(page.locator('[data-state="error"]')).toBeVisible();
    await expect(page.getByText('عطلٌ مصطنع للاختبار')).toBeVisible();
    await expect(page.locator('[data-state="empty-first"]')).toHaveCount(0);
    await expect(page.getByText('لا عقود بعد')).toHaveCount(0);
    await page.unroute('**/contracts?**');
  });

  test('⑤ 403 يُعرض «من يمنح» — والجدولُ لا يُرسم', async () => {
    const page = session.page();
    await page.route('**/contracts?**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'لا تملك صلاحية العقود' }) }));
    await page.goto('/contracts');
    await expect(page.locator('[data-state="forbidden"]')).toBeVisible();
    await expect(page.getByText('ومن يمنحها')).toBeVisible();
    await expect(page.locator('table.rz-table')).toHaveCount(0);
    await page.unroute('**/contracts?**');
  });

  test('④ عقدٌ حقيقي: الصفحةُ من الخادم، والأعمدةُ بالقياس، والبطاقةُ تقرأ الأقساط', async ({ request }, testInfo) => {
    const page = session.page();
    const { no } = await seedContract(request, state as TestCompany);
    await page.goto('/contracts');
    const wrap = page.locator('.rz-table-wrap');
    await expect(wrap).toHaveAttribute('data-status', 'ready');
    await noHorizontalScroll(page);

    const viewport = testInfo.project.use.viewport?.width ?? 1280;
    if (viewport <= 375) {
      await expect(wrap).toHaveAttribute('data-layout', 'stack');
      const row = page.locator('.rz-stack__row').first();
      const h = await row.evaluate((el) => el.getBoundingClientRect().height);
      expect(h, 'الصفُّ المصفوف ≥ 48px').toBeGreaterThanOrEqual(48);
      await expect(page.locator('table.rz-table')).toHaveCount(0);
    } else {
      await expect(wrap).toHaveAttribute('data-layout', 'table');
      const hidden = await page.locator('.rz-table__note').getAttribute('data-hidden-columns');
      // 9 أعمدة بعرضٍ مقيس: 1280 (970px) ⇒ يدخل ٨ · 768 (740px) ⇒ يدخل ٥
      expect(Number(hidden)).toBe(viewport >= 1280 ? 1 : 4);
      const th = await page.locator('table.rz-table thead th').count();
      expect(th - (await page.locator('table.rz-table thead th[aria-label]').count())).toBe(viewport >= 1280 ? 8 : 5);
    }

    // سطرُ العدّ من الخادم
    await expect(page.locator('.rz-pagehead__count')).toHaveAttribute('data-count', 'ready');
    await expect(page.getByText(no).first()).toBeVisible();

    // البطاقة
    await page.getByText(no).first().click();
    const panel = page.locator('.rz-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-section="facts"]')).toBeVisible();
    await expect(panel.getByText('سكنيّ · معفى')).toBeVisible();
    await panel.getByRole('tab', { name: 'الأقساط' }).click();
    const rows = panel.locator('[data-section="installments"] tbody tr');
    expect(await rows.count(), 'أقساطٌ من الخادم').toBeGreaterThanOrEqual(1);
    // لا مجموعَ في البطاقة — ما يُعرض صفوفٌ كما وصلت
    await expect(panel.getByText(/الإجمالي|المجموع/)).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('④ب تغييرُ المقاس بلا إعادة تحميل: الأعمدةُ تُعاد بالقياس (8 ⟵ 5 ⟵ 8 ⟵ مصفوف)', async ({ request }, testInfo) => {
    const start = testInfo.project.use.viewport ?? { width: 1280, height: 800 };
    test.skip(start.width < 1280, 'يُقاس من المقاس الواسع وحده — المسارُ واحد');
    const page = session.page();
    await seedContract(request, state as TestCompany);
    await page.goto('/contracts');
    const wrap = page.locator('.rz-table-wrap');
    await expect(wrap).toHaveAttribute('data-status', 'ready');
    const hiddenCount = () => page.locator('.rz-table__note').getAttribute('data-hidden-columns').then((v) => Number(v));
    await expect.poll(hiddenCount, { message: 'عند 1280 يُحال عمودٌ واحد' }).toBe(1);

    // تضييقٌ حيّ — لا إعادةَ تحميل: القياسُ يُعاد بـResizeObserver (§8.2.1: انتظارُ حالةٍ لا زمن)
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(hiddenCount, { message: 'عند 768 تُحال أربعة' }).toBe(4);
    await noHorizontalScroll(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(hiddenCount, { message: 'العودةُ إلى 1280 تُعيد الأعمدة' }).toBe(1);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(wrap).toHaveAttribute('data-layout', 'stack');
    await noHorizontalScroll(page);

    await page.setViewportSize(start);
    await expect(wrap).toHaveAttribute('data-layout', 'table');
  });
});
