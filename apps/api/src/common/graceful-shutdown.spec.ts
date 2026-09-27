import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings, stripComments } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): `Dockerfile` وملفَّ الإنتاج — ومعهما `main.ts` و`app.module.ts` بعد نزع تعليقاتهما.
readsDeclaredStrings();

/**
 * `ق-١٥٢٣` — **الإيقافُ المنظَّم للخادم: ثلاثةُ أشياءَ معاً، وغيابُ أيٍّ منها يُرجع القتلَ عند كلّ نشر.**
 *
 * قِيس قبلها (٢٦٨) على صورة الإنتاج: `docker stop` والقاعدةُ قائمة ⟸ `11165 ms` ثم `Exited (137)` وآخرُ سطرٍ
 * «API listening» — الصدفةُ هي العمليةُ الأولى فلا تمرّر الإشارة، ولا مستمعَ لها في الخادم.
 *
 *   ① أمرُ البدء: الهجراتُ **قبل** البدء كما هي، ثم `exec node …` — فالخادمُ هو العمليةُ الأولى لا ابنُ صدفة.
 *   ② `app.enableShutdownHooks()` في `main.ts` — وإلا لم يُسمع شيء؛ ومزوّدُ سطرَي الإيقاف مسجَّلٌ في الوحدة الجذر.
 *   ③ مهلةُ إيقافٍ **معلنة** على خدمة `api` في ملفّ الإنتاج — لا افتراضيُّ Docker الضمنيّ.
 *   ④ ⑤ **ونافذتا الإقلاع** — قِيستا بعد ①–③: الإيقافُ قبل تسجيل مستمع Nest أُهمل فقُتل الخادمُ بعد `31025 ms`؛
 *      فـ`trap` في الصدفة لنافذة الهجرات، ومستمعٌ مبكّر في `main.ts` يُرفع في خطوة تسجيل مستمع Nest نفسِها.
 *
 * ⚠️ **وحدُّه معلَن**: يحرس الشكلَ لا السلوك — والسلوكُ مُثبَتٌ مرّةً على الصورة المبنيّة (إيقافٌ والقاعدةُ قائمة ⟸ سطرا
 * الإيقاف وخروجٌ طبيعيّ قبل المهلة)، وهذا يمنع أن يعود الشكلُ الذي أنتج القتل.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO_ROOT, ...p), 'utf8');

const DOCKERFILE = read('apps', 'api', 'Dockerfile');
const COMPOSE = read('docker-compose.prod.yml');
const MAIN = stripComments(read('apps', 'api', 'src', 'main.ts'));
const APP_MODULE = stripComments(read('apps', 'api', 'src', 'app.module.ts'));
const BOOT_SIGNAL = stripComments(read('apps', 'api', 'src', 'common', 'lifecycle', 'boot-signal.ts'));

/** آخرُ `CMD` في الملفّ — هو الذي يسري (Docker يأخذ الأخير). */
function lastCmd(dockerfile: string): string {
  const cmds = dockerfile.split(/\r?\n/).filter((l) => /^CMD\s/.test(l));
  return cmds[cmds.length - 1] ?? '';
}

/** كتلةُ خدمةٍ في ملفّ `compose` بلا أسطر تعليقها: من `  <name>:` إلى أوّل خدمةٍ تاليةٍ على المستوى نفسِه. */
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l) || /^[A-Za-z]/.test(l));
  return rest
    .slice(0, end < 0 ? undefined : end)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('ق-١٥٢٣ — الإيقافُ المنظَّم للخادم: exec · enableShutdownHooks · مهلةٌ معلنة', () => {
  it('⓪ المسبارُ يرى: الملفّاتُ الأربعة مقروءة، وكتلةُ `api` وُجدت وفيها ما يُعرف أنه فيها', () => {
    expect(lastCmd(DOCKERFILE)).toMatch(/^CMD /);
    expect(MAIN).toContain('NestFactory.create');
    expect(APP_MODULE).toContain('ThrottlerGuard');
    const api = serviceBlock(COMPOSE, 'api');
    expect(api).toContain('dockerfile: apps/api/Dockerfile');
    // والضابطُ السالب: كتلةُ خدمةٍ أخرى لا تحمل ما في `api` — فالحدودُ تُقرأ لا يُقرأ الملفُّ كلُّه.
    expect(serviceBlock(COMPOSE, 'web')).not.toContain('dockerfile: apps/api/Dockerfile');
  });

  it('① أمرُ البدء: الهجراتُ قبل البدء، ثم الخادمُ عمليةً أولى بـ`exec` لا ابنَ صدفة', () => {
    const cmd = lastCmd(DOCKERFILE);
    const migrate = cmd.indexOf('prisma migrate deploy');
    const exec = cmd.search(/\bexec node dist\/src\/main\.js\b/);
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(exec).toBeGreaterThan(migrate);
  });

  it('② `enableShutdownHooks` في `main.ts`، ومزوّدُ سطرَي الإيقاف مسجَّلٌ في الوحدة الجذر', () => {
    expect(MAIN).toMatch(/\bapp\.enableShutdownHooks\(\)/);
    expect(APP_MODULE).toMatch(/providers:\s*\[[^\]]*\bShutdownLogService\b/);
  });

  it('③ مهلةُ إيقافٍ معلنة على `api` في ملفّ الإنتاج — سطرٌ لا تعليق', () => {
    expect(serviceBlock(COMPOSE, 'api')).toMatch(/^\s+stop_grace_period:\s*\d+s\s*$/m);
  });

  // نافذتا الإقلاع — مقيستان في ٢٦٨: قبل مستمع Nest أُهملت الإشارةُ فقُتل الخادمُ بعد `31025 ms`.
  it('④ نافذةُ الهجرات: `trap` على TERM قبل الهجرات — فإيقافٌ فيها يُكمل الهجرةَ ثم يخرج ولا يبدأ الخادم', () => {
    // بالمواضع لا بنمطٍ واحد: نصُّ الفخّ نفسُه يحمل `;` بين علامتَي اقتباس، فنمطٌ يقف عند أوّل `;` لا يبلغ `TERM`.
    const cmd = lastCmd(DOCKERFILE);
    const trap = cmd.indexOf("trap '");
    const term = cmd.indexOf(' TERM', trap);
    const migrate = cmd.indexOf('prisma migrate deploy');
    expect(trap).toBeGreaterThanOrEqual(0);
    expect(term).toBeGreaterThan(trap);
    expect(term).toBeLessThan(migrate);
  });

  it('⑤ نافذةُ الإقلاع: مستمعٌ يُسجَّل في أوّل استيراد، يبقى حتى `listen`، ثم يُرفع قبل `enableShutdownHooks` مباشرةً', () => {
    // قِيس: مستمعٌ في أوّل `bootstrap()` يأتي بعد تحميل الاستيرادات ⟸ `31537 ms` ثم `137`. فالأوّلُ استيرادُ ملفّه.
    const firstImport = MAIN.match(/^\s*import\b[^;]*?from\s+'([^']+)'/m)?.[1];
    expect(firstImport).toBe('./common/lifecycle/boot-signal');
    expect(BOOT_SIGNAL).toMatch(/^process\.once\('SIGTERM',\s*exitDuringBoot\);/m);
    const create = MAIN.indexOf('NestFactory.create');
    const listen = MAIN.search(/\bawait app\.listen\(/);
    const removed = MAIN.search(/process\.removeListener\('SIGTERM',\s*exitDuringBoot\)/);
    const hooks = MAIN.search(/\bapp\.enableShutdownHooks\(\)/);
    // قِيس: مستمعُ Nest قبل `listen` ⟸ أُغلق التطبيقُ ثم فُتح منفذُه فبقيت العمليةُ حتى قُتلت (`30812 ms` · `137`).
    expect(listen).toBeGreaterThan(create);
    expect(removed).toBeGreaterThan(listen);
    expect(hooks).toBeGreaterThan(removed);
    // ولا `await` بين الرفع والتسجيل — فلا لحظةَ بلا مستمع.
    expect(MAIN.slice(removed, hooks)).not.toMatch(/\bawait\b/);
  });
});
