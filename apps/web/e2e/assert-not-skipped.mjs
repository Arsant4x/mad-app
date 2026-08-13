/**
 * حارس التخطّي — **يقرأ أسماء الاختبارات من مصدرها، لا أرقام أسطرها**.
 *
 * ## لماذا أُعيد بناؤه (2026-08-13)
 *
 * كانت الصياغة السابقة في `web-tests.yml` تُطابق أرقام أسطر ثابتة:
 *
 *     grep -aE "... layout\.spec\.ts:(43|50|56|72):"
 *
 * وهي **حارسٌ يُبطله أي تحرير في الملف الذي يحرسه**: سطرٌ يُضاف في أعلى
 * `layout.spec.ts` — ولو تعليقاً — يُزيح الأربعة، فيتوقّف النمط عن
 * المطابقة ويصمت الحارس **بينما يبقى أخضر**. وهي عائلة العطب نفسها التي
 * أخفت 92 ملف اختبار عن السير سنةً.
 *
 * ## ما يفعله
 *
 * يشتقّ من **المصدر** أيَّ اختبارٍ يُتوقّع تنفيذه على أيّ عرض، ثم يقارن
 * ذلك بقائمة المتخطّى في مخرَج Playwright. والاشتقاق ضروري لأن التخطّي
 * ثلاثة أنواع لا يفرّق بينها المخرَج:
 *
 *   ✅ `project.name !== 'X'` — بالتصميم: سلوكٌ لا يظهر إلا على عرضٍ بعينه
 *   ✅ `!process.env.E2E_BASE_URL` — بالتصميم: يخصّ nginx لا خادم المعاينة
 *   ❌ `!hasApi` — **في السير يوجد API، فالتخطّي عطل إقلاع لا نقص بنية**
 *
 * والثالث هو ما يجب أن يمنع. ورسالة التخطّي نفسها تقولها حرفياً — لكن
 * أحداً لم يكن يقرأها، لأن الحارس كان يعدّ أرقام أسطر.
 *
 * ## حدود التحليل — مُعلَنة لا مخفيّة
 *
 * التحليل نصّي لا شجرة تركيب: يقسّم الملف عند `test(` ويقرأ العنوان
 * والشروط داخل كل قطعة، ويعتبر شرطاً في `beforeEach`/`describe` سارياً
 * على الملف كله. فشرطٌ محسوبٌ ديناميكياً (متغيّر يُبنى وقت التشغيل) لا
 * يُقرأ — **ويسقط الحارس حينئذٍ على جانب الحذر**: يعدّ الاختبار متوقَّعاً
 * فيمنع. الإنذار الكاذب يُقرأ ويُصلَح؛ والصمت لا.
 *
 *   node e2e/assert-not-skipped.mjs <ملف-سجل-playwright> [مجلد-e2e]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , logPath, e2eDirArg] = process.argv;
if (!logPath) {
  console.error('الاستعمال: node e2e/assert-not-skipped.mjs <ملف-السجل> [مجلد-e2e]');
  process.exit(2);
}
const E2E_DIR = e2eDirArg ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** يستخرج من ملف مواصفة: العنوان، والعروض المتوقَّعة لكل اختبار. */
function parseSpec(file) {
  const src = readFileSync(join(E2E_DIR, file), 'utf8');

  const chunks = src.split(/\n\s*test\(/);

  /**
   * ⚠️ الشروط الملفّية من **التمهيد وحده** — ما قبل أول `test(`.
   *
   * أول صياغة بحثت في `src` كاملاً، فالتقطت الشرط الموجود **داخل** اختبار
   * قائمة الجوال (`project.name !== 'mobile-375'`) وطبّقته على كل اختبارات
   * `layout.spec.ts`. والنتيجة: الحارس يعدّ الأربعة «متوقَّعة على الجوال
   * وحده»، فيمرّ على تخطٍّ غير مشروع على `desktop-1280` **بنجاحٍ تامّ**.
   *
   * كُشف بالإثبات بالعكس لا بالقراءة — وهو من عائلة [[الحارس يقرأ المصدر
   * لا المخرَج]]: قراءةُ مدًى أوسع من المقصود تُبطل الحارس كما يُبطله
   * ترشيحٌ سابق.
   *
   * و`test.beforeEach`/`test.describe` تقع في التمهيد بطبيعتها، ولا
   * يقطعها التقسيم لأن `test.` ليست `test(`.
   */
  const preamble = chunks[0];
  const fileOnlyProject = preamble.match(/test\.skip\(\s*testInfo\.project\.name\s*!==\s*['"]([^'"]+)['"]/)?.[1];
  const fileEnvSkipped = /test\.skip\(\s*!process\.env\.[A-Z_]+/.test(preamble);

  const parts = chunks.slice(1);
  return parts.map((part) => {
    const title = part.match(/^\s*['"`](.+?)['"`]\s*,/s)?.[1];
    // شرطٌ داخل الاختبار نفسه يَجُبّ شرط الملف.
    const ownProject = part.match(/test\.skip\(\s*testInfo\.project\.name\s*!==\s*['"]([^'"]+)['"]/)?.[1];
    const ownEnv = /test\.skip\(\s*!process\.env\.[A-Z_]+/.test(part);
    return {
      file,
      title,
      onlyProject: ownProject ?? fileOnlyProject ?? null,
      // مستثنى كلياً: تخطٍّ مشروطٌ ببيئة لا بعرض.
      excluded: ownEnv || fileEnvSkipped,
    };
  });
}

const specFiles = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));
const tests = specFiles.flatMap(parseSpec);

// ⚠️ حارسٌ للحارس: تحليلٌ يعطي صفر اختبارات يمرّ بنجاحٍ تامّ وهو لم يفحص
// شيئاً — وهو الفخّ الذي أوقعنا فيه مرّتين. فالعدد يُتحقَّق منه أولاً.
if (tests.length < 5 || tests.some((t) => !t.title)) {
  console.error(`::error::تحليل المواصفات أعطى ${tests.length} اختباراً وبعضها بلا عنوان — الحارس لم يفحص شيئاً`);
  process.exit(1);
}

const log = stripAnsi(readFileSync(logPath, 'utf8'));
/** أسطر المتخطّى: `  -  12 [project] › file:line:col › describe › title` */
const skipped = [];
for (const line of log.split('\n')) {
  const m = line.match(/^\s*-\s+\d+\s+\[([^\]]+)\]\s+›\s+.*?›\s*(.+?)\s*$/);
  if (m) skipped.push({ project: m[1], title: m[2].split(' › ').pop().trim() });
}

const violations = [];
for (const s of skipped) {
  const t = tests.find((x) => x.title === s.title);
  // عنوانٌ لا يقابله مصدر: لا يُبتلع — قد يكون تحليلاً فاشلاً لا تخطّياً بريئاً.
  if (!t) {
    violations.push(`«${s.title}» [${s.project}] — متخطًّى ولا يقابله اختبارٌ في المصدر (تحليلٌ فاشل؟)`);
    continue;
  }
  if (t.excluded) continue;
  if (t.onlyProject && t.onlyProject !== s.project) continue;
  violations.push(`«${s.title}» [${s.project}] — من ${t.file}، ويُتوقَّع تنفيذه على هذا العرض`);
}

console.log(`فُحص ${tests.length} اختباراً من ${specFiles.length} ملفاً · متخطًّى في المخرَج: ${skipped.length}`);

if (violations.length) {
  console.error('::error::اختبارات مُتخطّاة رغم توقّع تنفيذها — في السير يوجد API، فالتخطّي عطل إقلاع لا نقص بنية');
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log('✅ لا تخطٍّ غير مقصود — كل متخطًّى مشروطٌ بعرضٍ أو ببيئة في مصدره');
