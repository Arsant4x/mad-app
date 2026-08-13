import { readFileSync } from 'node:fs';
import { test, type APIRequestContext } from '@playwright/test';

/**
 * منشأة اختبار تُسجَّل وتُحذف لكل تشغيل (قرار المالك 2026-08-10).
 *
 * العزل أهم من السرعة: حسابٌ ثابت يتراكم عليه أثر كل تشغيل، فيصير سقوطُ
 * اختبارٍ سؤالاً عن أيّ تشغيلٍ سابق خلّف ماذا. والتسجيل نفسه اختبارٌ ثانٍ
 * بلا كلفة — يمرّ بمسار الإنشاء ودليل الحسابات الافتراضي في كل مرة.
 *
 * والحذف يمرّ بـ`DELETE /companies/:id` كما يفعل مدير المنصة، لا بحذفٍ في
 * القاعدة — فما لا يُنظّف عبر المسار الحقيقي لا يُثبت أن المسار الحقيقي ينظّف.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** ملف حالة التشغيل — يحمل بيانات المنشأة الواحدة المشتركة بين كل العروض
 *  والمجموعات. خارج المستودع (test-results/ متجاهَل). */
export const STATE_FILE = 'test-results/.e2e-company.json';

/** يقرأ منشأة التشغيل التي سجّلها globalSetup. */
export function readTestCompany(): { hasApi: boolean } & Partial<TestCompany> {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { hasApi: false };
  }
}

export interface TestCompany {
  username: string;
  password: string;
  companyId: string;
  token: string;
}

/**
 * هل الخادم متاح؟ يُستعمل لتخطٍّ **صريح ومعلَّل** لا صامت.
 *
 * ✅ صار للسير `services: postgres` وإقلاع API، فالتخطي لم يعد يقع في CI —
 * ويبقى للتشغيل المحلي بلا خادم. **يبقى صريحاً معلَّلاً لا صامتاً:** تخطٍّ
 * صامت هنا يترك المنعَ في CI بلا معنى — يمنع على ستة اختبارات ويعبر الحارس
 * الوحيد للتخطيط، وهو نفسه الحارس الوحيد لأ٣.
 */
export async function apiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    // 404 جوابٌ صالح هنا: المقصود أن شيئاً يردّ، لا أن المسار موجود.
    await request.get(`${API}/`, { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function registerCompany(request: APIRequestContext, tag: string): Promise<TestCompany> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const username = `e2e-${tag}-${stamp}`;
  const password = 'E2ePlaywright123!';

  const res = await request.post(`${API}/auth/register`, {
    data: { orgName: `منشأة اختبار ${tag} ${stamp}`, username, password },
  });
  if (!res.ok()) throw new Error(`تعذّر تسجيل منشأة الاختبار: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { username, password, companyId: body.user.companyId, token: body.accessToken };
}

/** يُنظّف بصلاحية مدير المنصة. يبتلع الفشل عمداً: تنظيفٌ متعثّر يجب ألّا
 *  يُسقط اختباراً نجح، لكنه يُطبع كي لا يتراكم صامتاً. */
export async function deleteCompany(request: APIRequestContext, companyId: string): Promise<void> {
  const admin = await request.post(`${API}/auth/login`, {
    data: {
      username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan_admin',
      password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD ?? '',
    },
  });
  if (!admin.ok()) {
    console.warn(`[cleanup] تعذّر دخول مدير المنصة (${admin.status()}) — بقيت المنشأة ${companyId}`);
    return;
  }
  const { accessToken } = await admin.json();
  const del = await request.delete(`${API}/companies/${companyId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!del.ok()) console.warn(`[cleanup] فشل حذف ${companyId}: ${del.status()} ${await del.text()}`);
}

/** دخولٌ عبر الواجهة نفسها لا بحقن رمز: المقصود اختبار ما يراه المستخدم. */
export async function loginThroughUi(page: import('@playwright/test').Page, co: TestCompany): Promise<void> {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(co.username);
  await page.locator('input[type="password"]').fill(co.password);
  await page.getByRole('button', { name: 'دخول' }).click();
  // 45s هامشٌ سخيّ: القياس المحلي 406ms لدورة تسجيل+دخول كاملة (argon2 ثقيل
  // عمداً: m=65536,t=3,p=4)، وعدّاء CI أبطأ ~9× — فالهامش يبقى ~5× حتى هناك.
  //
  // ⚠️ ولا يُقرأ هذا الرقم علاجاً لسقوطٍ سابق: رُفع 20s→45s ظناً أن السقوط
  // بطء، **فلم يتغيّر شيء** — والسبب كان CORS يحجب ردّ الدخول (`WEB_ORIGIN`
  // غائب عن السير). المهلة كانت عَرَضاً لا سبباً. فإن عاد هذا الانتظار
  // يسقط: لا ترفع الرقم — افحص أولاً هل وصل طلب `POST /auth/login` أصلاً.
  await page.locator('.app-shell').waitFor({ state: 'attached', timeout: 45_000 });
}

/**
 * جلسةٌ **حيّة** مشتركة — صفحةٌ واحدة مسجَّلة الدخول لكل مجموعة/عرض.
 *
 * ## لماذا لا `storageState`
 *
 * الطريق المعتاد في Playwright هو حفظ الحالة في ملف وإعادتها لكل اختبار.
 * وهو هنا **خطرٌ لا حلّ**: رمز التحديث أحاديُّ الاستعمال، وإعادة استعماله
 * تُفسَّر تسريباً فتُبطل **كل جلسات الهوية** (`auth.service.ts:95`). ولقطةٌ
 * محفوظة تُستعاد مرّتين هي بالضبط «إعادة استعمال» — فأول اختبارٍ يدوّر
 * الرمز، والثاني يقدّم القديم، فتموت الحزمة كلها بـ401.
 *
 * وهذه خاصيةٌ أمنية مقصودة لا عطب. فالحلّ يبقي الجلسة **حيّةً في السياق**
 * لا مُلتقَطة: ملفُّ تعريف الارتباط يتدوّر في المتصفّح نفسه، فلا إعادة
 * استعمال أصلاً.
 *
 * ## ولماذا هذا آمن
 *
 * `playwright.config.ts`: `workers: 1` و`fullyParallel: false` — التنفيذ
 * تسلسليّ، فلا اختباران يتقاسمان الصفحة في اللحظة نفسها.
 *
 * ## الأثر المقيس
 *
 * `POST /auth/login` محدودٌ بعشر محاولات في الدقيقة **لكل IP**، وعدّاء
 * السير يشغّل العروض الثلاثة من IP واحد. فكان مجموع الدخول في التشغيل
 * الكامل **اثنتي عشرة** محاولة — تمرّ بالتباعد الزمني لا بالتصميم، وقد
 * سقطت فعلاً مرّتين حين أُضيف ملفُّ مواصفةٍ واحد. وبهذه الجلسة تصير **ستّاً**.
 *
 *   test.describe('…', () => {
 *     const session = sharedSession();
 *     test('…', async () => { await session.page().goto('/x'); });
 *   });
 */
/**
 * @param opts.onlyProject اسم العرض الوحيد الذي تُنشأ الجلسة فيه.
 *
 * ⚠️ **لازمٌ لا تحسين.** `beforeAll` يعمل لكل عرض، فمجموعةٌ تُتخطّى على
 * عرضين تدفع مع ذلك ثمن الدخول فيهما — ثلاث محاولات مقابل اختبارٍ واحد.
 * وهو ما وقعتُ فيه في أول صياغة لهذا المُعامل بعينه.
 */
export function sharedSession(opts: { onlyProject?: string } = {}): {
  page: () => import('@playwright/test').Page;
  hasApi: () => boolean;
} {
  let page: import('@playwright/test').Page | undefined;
  let hasApi = false;

  test.beforeAll(async ({ browser }, testInfo) => {
    const state = readTestCompany();
    hasApi = state.hasApi;
    if (!hasApi) return;
    if (opts.onlyProject && testInfo.project.name !== opts.onlyProject) return;
    // العرض من المشروع صراحةً: صفحةٌ تُنشأ من `browser` لا ترث `use.viewport`،
    // وبدونه تُقاس اختبارات التخطيط كلها على 1280 — أي تمرّ بلا معنى.
    page = await browser.newPage({ viewport: testInfo.project.use.viewport });
    await loginThroughUi(page, state as TestCompany);
  });

  test.afterAll(async () => {
    await page?.close();
    page = undefined;
  });

  return {
    hasApi: () => hasApi,
    page: () => {
      if (!page) throw new Error('لا جلسة — استُدعيت `page()` قبل الدخول أو بلا API');
      return page;
    },
  };
}
