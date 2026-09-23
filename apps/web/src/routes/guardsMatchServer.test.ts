import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.1 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * حارس الواجهة يطابق حارس الخادم — **مقروءَين من مصدرَيهما**.
 *
 * ## العطل الذي يمنعه
 *
 * الواجهة تحرس المسار بـ`<ScreenGuard screen="X">`، والخادم يحرس النقطة
 * بـ`@RequiresScreen('Y')`. وافتراقُ `X` عن `Y` يُنتج إحدى حالتين، وكلتاهما
 * **لا تشتكي**:
 *
 * - `X` أوسع من `Y` ⇒ الرابط يظهر والصفحة تُركَّب، ثم **يرفض الخادم كل
 *   طلب**. المستخدم يرى شاشةً فارغة بلا سبب.
 * - `X` أضيق من `Y` ⇒ صلاحيةٌ يملكها المستخدم **مخفيّة عنه** بلا أن يعرف
 *   أحد.
 *
 * وقد وقع هذا فعلاً في سجل التفويض: بُني بـ`employees` في الطرفين، ثم
 * تغيّر قرار المالك إلى `audit` — ولولا هذا الفحص لكان تغييرُ طرفٍ دون
 * الآخر عطلاً صامتاً.
 *
 * ## ولماذا لا يكفي تعليقٌ يقول «طابق الخادم»
 *
 * التعليق يُقرأ مرةً ويُنسى. وهذا الفحص يقرأ **الملفَّين معاً في كل
 * تشغيل**، فيسقط لحظة افتراقهما.
 *
 * ⚠️ ويقرأ **المصدر** لا نوعاً مُترجَماً ولا مخرَجاً مُرشَّحاً — فالترشيح
 * بين الحارس ومصدره يُبطله صامتاً.
 */

const WEB = join(__dirname, '..');
const API = join(WEB, '..', '..', 'api', 'src');

/**
 * ⚠️ تسوية نهايات الأسطر **شرطُ صحّة لا تنظيف**.
 *
 * أول صياغة بحثت عن سطرٍ فارغ بـ`'\n\n'`، والملفات على ويندوز `\r\n` —
 * فلم يُطابق قطّ، وعاد `lastIndexOf` بـ`-1`، فقُرئ الملف **من أوّله**
 * والتُقط مُزخرِف الصنف بدل مُزخرِف الدالّة.
 *
 * وأخطر ما فيه أنه كان سيمرّ صامتاً لو تصادف تطابق الاثنين — **نجاحٌ
 * لسببٍ خاطئ**، وهو أسوأ من السقوط لأنه لا يُراجَع.
 */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/**
 * مسارات الواجهة: `path="X"` ⇒ `<ScreenGuard screen="Y">` **داخل عنصرها**.
 *
 * ⚠️ التقسيم على `<Route` شرطُ صحّة لا أناقة. صياغةٌ أولى استعملت نافذةً
 * منزلقة (`path="…"[\s\S]{0,240}?<ScreenGuard`)، فمسارٌ **بلا حارس**
 * (`company-profile`) كان يبتلع حارس المسار الذي يليه: يُنسَب إليه `audit`،
 * ويختفي `audit-log` من الخريطة كلياً.
 *
 * وأثرُه أن الحارس يقارن أزواجاً مغلوطة **بلا أن يشتكي** — ولم يكشفه إلا
 * فحصُ «يقرأ الملفات فعلاً» أسفله.
 */
function routeGuards(): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of read(join(WEB, 'App.tsx')).split('<Route').slice(1)) {
    const path = block.match(/^\s*path="([^"]+)"/m)?.[1];
    if (!path) continue;
    const screen = block.match(/<ScreenGuard screen="([^"]+)"/)?.[1];
    if (screen && !out.has(path)) out.set(path, screen);
  }
  return out;
}

/** مدخلات الشريط: `{ screen: 'X', to: '/Y'` */
function navGuards(): Map<string, string> {
  const src = read(join(WEB, 'layout', 'AppShell.tsx'));
  const out = new Map<string, string>();
  for (const m of src.matchAll(/\{\s*screen:\s*'([^']+)'\s*,\s*to:\s*'\/([^']*)'/g)) {
    out.set(m[2], m[1]);
  }
  return out;
}

/**
 * حارس نقطةٍ في الخادم: شاشة الصنف، ويَجُبّها ما على الدالّة.
 *
 * ⚠️ **يُقرأ من الدالّة أولاً** لأن `tenant.guard.ts` يستعمل
 * `getAllAndOverride([getHandler(), getClass()])` — أي أن المُعالِج يَجُبّ
 * الصنف. وقراءةُ الصنف وحده هنا تُنتج حارساً يوافق نفسه ويخالف الواقع.
 */
function serverScreenFor(controllerPath: string, method: string): string | null {
  const src = read(join(API, controllerPath));
  const classScreen = src.match(/^@RequiresScreen\('([^']+)'\)/m)?.[1] ?? null;
  const at = src.indexOf(`${method}(@CurrentTenant`);
  if (at < 0) return null;
  // **الأقرب فوق الدالّة يفوز** — لا الأول في نافذةٍ ما. نافذةٌ ثابتة
  // وأخذُ آخر تطابق فيها أمتنُ من البحث عن سطرٍ فارغ: لا يعتمد على تنسيق
  // ولا على نهاية سطر.
  const above = src.slice(Math.max(0, at - 600), at);
  const hits = [...above.matchAll(/@RequiresScreen\('([^']+)'\)/g)];
  return hits.length ? hits[hits.length - 1][1] : classScreen;
}

describe('حارس الواجهة يطابق حارس الخادم', () => {
  const routes = routeGuards();
  const nav = navGuards();

  it('يقرأ الملفات فعلاً — حارسٌ على خريطةٍ فارغة ليس حارساً', () => {
    // الفخّ الذي أوقعنا مرّتين: مسارٌ أو نمطٌ خاطئ يعطي صفر مدخلات، فيمرّ
    // الفحص بنجاحٍ تامّ وهو لم يقارن شيئاً.
    expect(routes.size).toBeGreaterThan(10);
    expect(nav.size).toBeGreaterThan(10);
    expect(routes.get('audit-log')).toBe('audit');
  });

  it('⭐ سجل التفويض: المسار والشريط والخادم على `audit` — الثلاثة', () => {
    const server = serverScreenFor(join('delegations', 'delegations.controller.ts'), 'log');
    expect(server).toBe('audit');
    expect(routes.get('delegation-log')).toBe(server);
    expect(nav.get('delegation-log')).toBe(server);
  });

  it('⭐ كل مدخل شريط يوافق حارس مساره — لا رابطٌ يقود إلى رفض', () => {
    // مدخلٌ في الشريط بشاشةٍ تخالف حارس مساره يُظهر رابطاً تقود صفحته إلى
    // `AccessDenied` — أو العكس: صفحةٌ متاحة بلا رابطٍ إليها.
    const mismatched: string[] = [];
    for (const [to, screen] of nav) {
      const routeScreen = routes.get(to);
      // مسارٌ بلا `ScreenGuard` (كالإشعارات) مقصود — يُترك للخادم وحده.
      if (routeScreen && routeScreen !== screen) mismatched.push(`/${to}: الشريط «${screen}» والمسار «${routeScreen}»`);
    }
    expect(mismatched).toEqual([]);
  });
});
