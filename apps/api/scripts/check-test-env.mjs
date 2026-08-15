/**
 * بوّابة تشخيصية قبل الاختبارات — تجعل نقص التهيئة **مقروءاً**.
 *
 * خطّاف `post-checkout` يهيّئ الشجرة تلقائياً. وهذه شبكةُ أمانٍ تحته: نسخةٌ
 * بلا `core.hooksPath` مضبوط · شجرةٌ أُنشئت قبل وصول الخطّاف · حذفٌ يدوي.
 *
 * وقيمتُها أنها تحوّل عطلاً **يُقرأ انحداراً في الشيفرة** إلى سطرٍ يقول ما
 * ينقص وما يُشغَّل. فبلا `node_modules`:
 *
 *     Module ts-jest in the transform option was not found.
 *
 * وبلا `DATABASE_URL`: تتخطّى المجسّات الحيّة أو تسقط بـ
 * `PrismaClientInitializationError` — وكلاهما لا يذكر التهيئة بحرف.
 *
 * ⚠️ **لا تسقط في السير**: السير يضبط `DATABASE_URL` في بيئة الوظيفة، وهو
 * أحد الشرطين المقبولين. وهي لا تُطلَق فيه أصلاً — `pretest` يتبع `test`
 * وحدها، والسير يستدعي `jest` مباشرةً و`test:e2e`.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];

// ① الحزم — تُقرأ بوجود وحدةٍ يحتاجها jest فعلاً، لا بوجود المجلد:
//    مجلدٌ فارغ أو وصلةٌ معطوبة تمرّ من اختبار الوجود وتسقط عند التشغيل.
if (!existsSync(join(apiRoot, '..', '..', 'node_modules', 'ts-jest', 'package.json'))) {
  problems.push([
    'الحزم غير مربوطة بهذه الشجرة (ts-jest لا يُحلّ)',
    'ويندوز:  cmd /c mklink /J "<الشجرة>\\node_modules" "<المستودع الرئيس>\\node_modules"',
    'غيره:    ln -s <المستودع الرئيس>/node_modules <الشجرة>/node_modules',
  ]);
}

// ② بيئة الاختبار — يكفي أحدهما: ملفٌّ محلي أو متغيّرٌ في البيئة (وهو ما
//    يفعله السير). واشتراطهما معاً يُسقط السير بلا سبب.
if (!existsSync(join(apiRoot, '.env.test')) && !process.env.DATABASE_URL) {
  problems.push([
    'لا apps/api/.env.test ولا DATABASE_URL في البيئة',
    'cp apps/api/.env.test.example apps/api/.env.test',
  ]);
}

if (problems.length > 0) {
  console.error('\n✖ الشجرة غير مهيّأة — وهذا نقصُ تهيئة لا عطلٌ في الشيفرة:\n');
  for (const [title, ...fixes] of problems) {
    console.error(`  • ${title}`);
    for (const fix of fixes) console.error(`      ${fix}`);
  }
  console.error('\n  (خطّاف .githooks/post-checkout يفعل هذا تلقائياً — تحقّق من core.hooksPath)\n');
  process.exit(1);
}
