import { expect, test } from '@playwright/test';
import { readTestCompany } from './fixtures';

/**
 * التفويض — **حدود الخادم كما يراها متجاوِز**.
 *
 * ⚠️ والقاعدة التي يحرسها الاثنان: **إخفاء الزر ليس منعاً.** الطلب فيهما
 * يُصنع بـ`request` لا بنقرة — أي بلا مرورٍ بأي زر ولا بأي ترشيحٍ بصري —
 * وهو بالضبط ما يفعله من يحاول التجاوز. ونجاحُ أيٍّ منهما يعني أن ترشيح
 * الشجرة كان كل الحماية.
 *
 * ⛔ **ولا توكيد على الصفحة هنا** — بندٌ محجوب بحدٍّ أمني خارج هذا العمل،
 * مشروحٌ أسفله بدليله. والصفحة مغطّاة في vitest وحدها.
 */

const co = readTestCompany();
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.describe('التفويض — شجرةً وسجلاً', () => {
  test.skip(!co.hasApi, 'يتطلّب خادماً حيّاً — تخطٍّ صريح لا صامت');

  /*
   * ⛔ **بندٌ محجوب — لا مُسقَط: توكيدٌ على الصفحة في متصفّح حقيقي.**
   *
   * كان هنا اختبارٌ يدخل بالواجهة ويتحقّق أن `/delegation-log` يعرض
   * `log-empty`، وأن الشريط يحمل رابطه ولا يحمل شاشةً مستقلة. وأُزيل
   * **لسببٍ خارج هذا البند**:
   *
   * `POST /auth/login` محدودٌ بعشر محاولات في الدقيقة لكل IP
   * (`auth.controller.ts`) — «سخيّة لإنسان وعديمة النفع لسكربت تخمين».
   * وعدّاء السير يشغّل العروض الثلاثة **من IP واحد**، فالسقف يبلغه مجموع
   * الحزمة لا ملفٌّ بعينه. كانت خمساً لكل عرض (15 للتشغيل) فتمرّ بتباعدٍ
   * زمني؛ وإضافة **واحدة** جعلتها 18 فسقطت — أولاً في ملفّي، ثم بعد
   * تقليلي إلى واحدة سقطت في `rowmenu.spec.ts` بدلاً منه. أي أن الحزمة
   * **لا تحتمل دخولاً إضافياً واحداً**.
   *
   * والدليل من ملف السياق لا من فرضية:
   *   - paragraph [ref=e11]: "ThrottlerException: Too Many Requests"
   *
   * ولم أُصلحه بأيٍّ من الثلاثة السهلة: رفعُ الحدّ يُضعف حارساً أمنياً
   * مقصوداً · و`SkipThrottle` للاختبار يجعل الحارس قابلاً للتعطيل بعلمٍ
   * بيئي · ورفعُ المهلة يعالج العَرَض (وتعليق `fixtures.ts` يحذّر منه
   * حرفياً).
   *
   * وتحرير ميزانيةٍ من `layout.spec.ts` ممكنٌ تقنياً — اختباران متجاوران
   * يدخلان ثم يقيسان الشيء نفسه — لكن حارس التخطّي في السير يقرأ **أرقام
   * أسطر ثابتة** فيه (`layout\.spec\.ts:(43|50|56|72)`)، فأي تحرير يُزيحها
   * ويُبطل حارس أ٣ صامتاً. ولا أُعيد تشكيل حرّاس ميزةٍ أخرى لأُفسح لميزتي.
   *
   * **ما بقي مغطّى:** الصفحة والمكوّن في vitest (6 + 8 توكيدات)،
   * والنقاط حيّةً في `test/delegations.e2e-spec.ts` (تسعة مسارات).
   * **وما فُقد:** تركيبُ الصفحة في متصفّح حقيقي مقابل خادمٍ حيّ.
   *
   * القرار للمالك — بندٌ مسجَّل في وصف الطلب.
   */


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
