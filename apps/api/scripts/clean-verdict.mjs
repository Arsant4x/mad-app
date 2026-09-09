import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * **حكمُ التشغيل: نتيجةٌ أم انقطاع؟** (`ق-٣٣٤`).
 *
 * ── العطل الذي أنشأ هذا الملف ────────────────────────────────────────────
 *
 * سقطت الحزمةُ النظيفة **بلا مجموعةٍ ساقطة**: ٣٧ مجموعةً خضراء ثم انقطاعٌ بلا
 * ملخّص. **والسببُ خارجها**: `docker inspect` أعطى `FinishedAt=23:48:05` ثم
 * `StartedAt=23:48:07` — **إعادةُ تشغيلٍ لمحرّك الحاويات من تحتها**، بلا
 * `OOMKilled` وبلا انهيار.
 *
 * ⚠️ **وتوقيعُه توقيعُ `ق-٣٢٣`**: شيفرةٌ خضراء تبدو حمراء لسببٍ ليس فيها —
 * **وقد كانت خضراء فعلاً قبله وبعده**. **والفرقُ أن هذا لا يُمنَع بانضباط**:
 * لا يملك أحدٌ منعَ المحرّك من إعادة التشغيل. **فالعلاجُ تمييزٌ لا منع.**
 *
 * ── ولماذا ملفُّ نتيجةٍ لا قراءةُ سطر ─────────────────────────────────────
 *
 * **الإشارةُ بنيويّة لا نصّية**: `jest --json --outputFile` يكتب حصيلةً
 * **بعد اكتمال التشغيل وحده**. فوجودُ الملفِّ صالحاً **هو** «سطرُ النتيجة»،
 * **وغيابُه انقطاعٌ لا فشل** — ولا يعتمد على صياغةٍ في مخرَجٍ قد تتغيّر.
 *
 * ⚠️ **ورمزُ الخروج لا يكفي**: تشغيلٌ قُتل أعطى `4`، وجيست يعطي `1` على
 * السقوط — **وكلاهما «غير صفر»**. فالتمييزُ من الحصيلة لا من الرمز.
 *
 * ── ويُستدعى مباشرةً كأداةٍ كي يُثبَت بالعكس ──────────────────────────────
 *
 * `node scripts/clean-verdict.mjs <مسار الحصيلة> <سقط:0|1>` يطبع الحكم —
 * **فيمتحنه اختبارٌ بثلاث حالاتٍ معلومة**، لا بثقةٍ في قراءة.
 */

/** الحصيلةُ نصّاً، أو `null` حين لا ملفّ. */
export function classify(raw, threw) {
  if (raw === null) return 'INTERRUPTED';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ⚠️ **ملفٌّ نصفُ مكتوب انقطاعٌ أيضاً**: القتلُ أثناء الكتابة يترك `JSON`
    // مبتوراً — **وقراءتُه فشلاً كذبٌ كقراءة الغياب فشلاً**.
    return 'INTERRUPTED';
  }

  // والحصيلةُ تُتحقَّق بحقلَين لا بوجودِ كائن: ملفٌّ صالحٌ لشيءٍ آخر ليس حصيلة.
  if (typeof parsed?.success !== 'boolean' || typeof parsed?.numTotalTests !== 'number') return 'INTERRUPTED';

  // ⚠️ **وصفرُ اختبارٍ ليس نجاحاً**: مرشّحُ اسمٍ لا يطابق شيئاً يُعطي حصيلةً
  // `success: true` **بلا توكيدٍ واحد** — **وهي خضرةٌ لا تعني شيئاً**، عينُ
  // عطل `ci-split`: أمرٌ يبدو أنه يفحص وهو لا يفحص.
  //
  // ⚠️ **والحقلُ المقيس هو `numPassedTests` لا `numTotalTests`**: أوّلُ صياغةٍ
  // فحصت المجموع **فمرّت خضراء**، لأن جيست يعدّ المتخطَّى في المجموع. القياس:
  // `{ total: 20, passed: 0, failed: 0, pending: 20, success: true }`.
  const ran = (parsed.numPassedTests ?? 0) + (parsed.numFailedTests ?? 0);
  if (ran === 0) return 'EMPTY';

  // وتناقضٌ بين الحصيلة والخروج يُقرأ سقوطاً — **الأشدُّ يُغلِّب**.
  return parsed.success && !threw ? 'PASS' : 'FAIL';
}

/** يقرأ الحصيلة إن وُجدت، ويعيد `null` بلا رمي — فالغيابُ حالةٌ لا خطأ. */
export function readResult(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function verdictOf(path, threw) {
  return classify(readResult(path), threw);
}

/**
 * ⭐ **سقفُ كومة `V8` مشتقٌّ من سعة المضيف** (`ق-٤٠٢`).
 *
 * ⚠️ **ورقمٌ ثابتٌ خطأٌ في الاتجاهين**: `6144` على مضيفٍ سعتُه `7.79 GB`
 * **أوقف الحزمة عند ٢٧ مجموعة** — لأن `V8` يؤجّل الكنس حتى يقارب سقفَه،
 * **فيبتلع ما يحتاجه محرّكُ Prisma الأصليّ وحاوياتُ القاعدة**. والعكسُ
 * يُهدر مضيفاً واسعاً.
 *
 * **والثلث حصّةٌ معلَنة لا مثلى**: يترك للمضيف ثلثيه — **للحاويات (`~1 GB`)
 * ولمحرّكات Prisma الأصليّة (خارج الكومة) ولنظام التشغيل**. **وقِيس على
 * المضيف الحالي**: `7.79 GB` ⇒ `2560` تقريباً، **وهو ما ضاعف ما اكتمل**
 * (٢٧ ⇒ ٦٢). **والحدّان يمنعان السخف**: لا أقلَّ من `1024` فلا تكفي
 * `ts-jest`، ولا أكثرَ من `8192` فلا فائدة بعده لهذه الحزمة.
 */
export function heapCapMb(totalBytes) {
  const third = Math.floor(totalBytes / 3 / 1024 / 1024);
  return Math.min(8192, Math.max(1024, third));
}

/**
 * ⭐ **حكمُ الشرائح مجتمعةً — والأشدُّ يُغلِّب** (`ق-٤٠٢`).
 *
 * ⚠️ **والانقطاعُ أشدُّ من السقوط**: شريحةٌ لم تُكمل **تُبطل الحكم كلَّه** —
 * فما لم يُشغَّل لا يُقال عنه شيء، **وقراءةُ الباقي نجاحاً هي عينُ الخضرة
 * الكاذبة**. **ثم السقوط، ثم الفراغ، ثم النجاح.**
 *
 * ⚠️ **و`PASS` تحتاج كلَّ الشرائح**: واحدةٌ `EMPTY` تعني نمطاً لم يطابق
 * شيئاً فيها — **وهو حكمٌ على النمط لا على الشيفرة**.
 */
export function combineVerdicts(verdicts) {
  if (verdicts.length === 0) return 'INTERRUPTED';
  for (const worst of ['INTERRUPTED', 'FAIL', 'EMPTY']) {
    if (verdicts.includes(worst)) return worst;
  }
  return 'PASS';
}

/**
 * **عددُ ملفات الاختبار التي يطابقها النمط** — من مخرَج `jest --listTests`.
 *
 * ⚠️ **ثغرةٌ كشفها الإثباتُ بالعكس**: نمطٌ **لا يطابق شيئاً** يُخرج جيست
 * بغير صفرٍ **ولا يكتب حصيلة** — **فيبدو انقطاعاً وهو ليس كذلك**، فتُبتلع
 * حالةُ «شُغِّل صفرُ اختبار» في عذرٍ. **وهي عينُ عطل `ci-split`**: أمرٌ يبدو
 * أنه يفحص وهو لا يفحص شيئاً.
 *
 * فيُسأل النمطُ **قبل التشغيل**، ويصير الغيابُ بعده **انقطاعاً حقيقياً**.
 */
export function countListedTests(stdout) {
  if (!stdout) return 0;
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /\.(spec|e2e-spec)\.ts$/.test(l)).length;
}

/**
 * ⭐ **ملفُّ الكاشف المستثنى — يُسمّى صراحةً لا بنمط** (`ق-٤١٥`①).
 *
 * ⚠️ **ونمطٌ مثل `/probe/` مرفوضٌ بحجّةٍ قائمة**: يتّسع بعد شهور إلى **كلِّ
 * ما ينتهي بـ`probe`** — **فيُعمي البوّابةَ عن ملفٍّ لم يوجد بعد**، وهو عينُ
 * «استثناءٌ يوسّع الباب بلا أن يُقرأ».
 */
export const PROBE_OWN_SPEC = 'nested-transaction-probe.spec.ts';

/**
 * ⭐ **عددُ بلاغات المعاملة المتداخلة — من أداةٍ مُصادَقة لا من `grep`**
 * (`ق-٤١٥`② · `ق-٤١٦`).
 *
 * ── العطل الذي بُنيت له ──────────────────────────────────────────────────
 *
 * `grep` على نصّ السجل أعطى **ستّة**، **والحقيقة ثلاثة**: **نصفُها سطرُ
 * `console.warn` في الشيفرة كما يعرضه جيست في أثر التوكيد** — **لا بلاغاً**.
 * ⇒ **فالنمطُ النصّيُّ صادقُ الصيغة كاذبُ المعنى**، وهو ما يفصله هذا العادّ:
 * **البلاغُ سطرٌ يحمل رقماً محلولاً (`بلاغٌ ٣/٥٠`)**، **والسطرُ المعروض يحمل
 * القالبَ نفسَه غيرَ محلول**.
 *
 * ── والنسبةُ لا العدد وحده ───────────────────────────────────────────────
 *
 * ⚠️ **بلاغٌ من حالات الكاشف الموجبة ليس عطلاً تطبيقياً** — **وحارسٌ لا
 * يُبلّغ عن نفسه حارسٌ لا يعمل** (حكمُ المالك). **فيُنسب كلُّ بلاغٍ إلى
 * مصدره من أثره**: `own` لما يسمّي ملفَّ الكاشف، و`foreign` لما لا يسمّيه.
 *
 * **والبوّابة**: `foreign === 0` — **و`own` يُقرأ رقماً**: **زيادتُه عن ثلاثة
 * تعني بلاغاً جديداً داخل الحارس نفسِه** فيُفحص.
 */
export function nestedReports(log) {
  const lines = String(log ?? '').split(/\r?\n/);
  // ⚠️ **رقمٌ محلولٌ شرطُ التمييز**: `\d+/\d+` لا `${...}` — **وهو الفرقُ
  //    بين بلاغٍ وقع وسطرِ شيفرةٍ يُعرض**.
  const header = /معاملةٌ داخل معاملة .*بلاغٌ\s+\d+\s*\/\s*\d+/;
  const reports = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!header.test(lines[i])) continue;
    /**
     * **الأثرُ يُجمَع حتى الترويسةِ التالية أو أوّلِ قسمٍ من جيست**.
     *
     * ⚠️ **ولا يُكسَر عند أوّل سطرٍ ليس إطاراً** — **وهذه صياغةٌ أولى سقطت
     * بالقياس**: `new Error().stack` **يبدأ بسطر `Error:`**، فكُسر الجمعُ
     * عنده **فجاءت الأطرُ فارغةً ونُسب كلُّ بلاغٍ إلى التطبيق**. **والعكسُ
     * تماماً هو الصحيح.** ⇒ **فالفاصلُ ما يُعلن قسماً جديداً، لا ما ليس إطاراً.**
     */
    const frames = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const stripped = lines[j].replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (header.test(stripped) || /^(PASS|FAIL|Tests:|Test Suites:|console\.)/.test(stripped)) break;
      if (stripped.startsWith('at ')) frames.push(stripped);
    }
    reports.push({ own: frames.some((f) => f.includes(PROBE_OWN_SPEC)), frames });
  }
  const own = reports.filter((r) => r.own).length;
  return { total: reports.length, own, foreign: reports.length - own };
}

// أداةٌ حين تُستدعى مباشرة — وهذا ما يمتحنه الاختبار بحالاتٍ معلومة.
// `verdict <مسار> <سقط:0|1>` · `count` يقرأ مخرَج `--listTests` من المدخل.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , first, second] = process.argv;
  // ⚠️ **يُستدعيان كأداةٍ كذلك** (`ق-٤٠٢`): الاختبارُ يشغّل **هذا الملفّ**
  //    لا نسخةً من منطقه — **فنسخةٌ تُثبت النسخة**.
  if (first === 'combine') {
    process.stdout.write(combineVerdicts(second ? second.split(',').filter(Boolean) : []));
  } else if (first === 'heap') {
    process.stdout.write(String(heapCapMb(Number(second))));
  } else if (first === 'reports') {
    // يقرأ سجلَّ الحزمة من المدخل ويطبع `total own foreign`.
    let stdin = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (stdin += c));
    process.stdin.on('end', () => {
      const r = nestedReports(stdin);
      process.stdout.write(`${r.total} ${r.own} ${r.foreign}`);
    });
  } else if (first === 'count') {
    let stdin = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (stdin += c));
    process.stdin.on('end', () => process.stdout.write(String(countListedTests(stdin))));
  } else {
    process.stdout.write(verdictOf(first, second === '1'));
  }
}
