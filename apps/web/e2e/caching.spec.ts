import { expect, test } from '@playwright/test';

/**
 * الاختبار ٧ — ترويسات التخزين.
 *
 * يحرس العطل الأول في سببه الحقيقي: `index.html` شُحن بلا `Cache-Control`،
 * فطبّق المتصفح تخزيناً **استدلالياً** وخدمه من ذاكرته بلا مراجعة. وعند
 * إعادة النشر يتغيّر هاش الحزمة، فيطلب الـHTML المخزَّن الهاشَ القديم ⇒ 404
 * ⇒ صفحة بيضاء لا يشفيها تحديثٌ عادي لأنه يعيد نفس الـHTML.
 *
 * ⚠️ **حدّ هذا الاختبار:** يقيس ما يقدّمه خادم المعاينة في CI، وهو ليس nginx.
 * فقيمةُ التوكيد الحقيقية على البيئة المنشورة — ولذلك رُبط التشغيل اليدوي
 * على المنشورة بإجراءٍ موثَّق قبل كل نشر (DEPLOY.md). يُشغَّل هذا الملف على
 * المنشورة بـ:  E2E_BASE_URL=https://… npm run test:e2e
 */
test.describe('الاختبار ٧ — index.html يُراجَع والأصول تُخزَّن', () => {
  test.skip(!process.env.E2E_BASE_URL, 'ترويسات التخزين تخصّ nginx — تُقاس على البيئة المنشورة لا على خادم المعاينة');

  test('index.html يحمل no-cache', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const cc = res.headers()['cache-control'] ?? '';
    expect(cc, 'index.html بلا تعليمة مراجعة — العطل بعينه').toMatch(/no-cache|no-store|max-age=0/);
  });

  test('الأصول المجزّأة تُخزَّن طويلاً — وإلا ضاعت فائدة التجزئة', async ({ request, baseURL }) => {
    const html = await (await request.get('/')).text();
    const asset = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/)?.[0];
    expect(asset, 'لم أجد أصلاً مجزّأً في index.html').toBeTruthy();

    const res = await request.get(new URL(asset!, baseURL).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control'] ?? '').toContain('max-age=');
  });

  test('هاشٌ لا وجود له يردّ 404 لا صفحةَ HTML', async ({ request }) => {
    // لو ردّ الاحتياطي بـindex.html هنا، لحُمِّل HTML مكان JavaScript
    // وانهار التطبيق برسالة مُضلِّلة تماماً.
    const res = await request.get('/assets/index-DOESNOTEXIST.js');
    expect(res.status()).toBe(404);
  });
});
