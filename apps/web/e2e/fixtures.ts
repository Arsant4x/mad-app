import { readFileSync } from 'node:fs';
import type { APIRequestContext } from '@playwright/test';

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
 * ⏳ بند متابعة بتاريخ — **يُنفَّذ قبل 2026-08-17**: أضف `services: postgres`
 * وإقلاع الـAPI إلى `.github/workflows/web-tests.yml`، واحذف هذا التخطي.
 * وإلا صار تحويل CI إلى المنع في ذلك التاريخ **بلا معنى**: يمنع على ستة
 * اختبارات ويتخطّى الحارس الوحيد للتخطيط — وهو الوحيد الذي يحرس أ٣.
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
  // 45s لا 20s: قياسٌ محلي أعطى 406ms لدورة تسجيل+دخول كاملة (argon2 ثقيل
  // عمداً: m=65536,t=3,p=4) — أي هامش 49×. لكن عدّاء CI قيس أبطأ ~9× في هذا
  // المشروع، والهامش المتبقي حينها ~5× وحده. الرفع تأمينٌ رخيص: لا يُخفي
  // عطلاً — الاختبار يسقط كما يسقط، وإنما بعد مهلةٍ أصدق.
  await page.locator('.app-shell').waitFor({ state: 'attached', timeout: 45_000 });
}
