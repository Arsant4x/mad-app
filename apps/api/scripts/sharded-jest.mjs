import { execSync, spawn } from 'node:child_process';
import { createWriteStream, readFileSync, rmSync } from 'node:fs';
import { tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { combineVerdicts, countListedTests, heapCapMb, nestedReports, PROBE_OWN_SPEC, verdictOf } from './clean-verdict.mjs';

/**
 * ⭐ **تشغيلُ جيست على شرائح — مصدرٌ واحدٌ يستهلكه المحلّيّ والسير** (`ق-٤٢٤` · `ق-٤٢١`).
 *
 * ── العطل الذي بُني له ───────────────────────────────────────────────────
 *
 * `--runInBand` يُشغّل الحزمة **في عمليةِ `node` واحدة**، وكلُّ مجموعةِ `e2e`
 * تُقلع `AppModule` ومحرّكَ Prisma. **فالذاكرةُ تتراكم**، **والحزمةُ تنقطع**:
 *
 *   · **محلّياً**: `٦٢` مجموعةً ثم انقطاع ⇒ **وبالتشريح `١٧٦` بصفر سقوط**.
 *   · **وفي السير**: `٩٩` مجموعةَ `e2e` **على الحافّة** — **خضراء بلا إضافة،
 *     وحمراء بأيّ إضافة**: مجموعةٌ جديدة، أو غلافٌ على كل معاملة (`ق-٤٢٣`).
 *
 * ── ولماذا مصدرٌ واحد لا نسختان ──────────────────────────────────────────
 *
 * ⚠️ **حارسٌ يُنسخ يومَ يحتاجه ثانٍ هو `ق-٣٥٣` بعينها** (حكمُ المالك) —
 * **وقد عُدَّت سبعُ نسخٍ منها في يومٍ واحد**. **والنسخُ لا يُخطئ يوم يُكتب بل
 * يوم يُصلَح أحدُها وحده.** ⇒ **فمنطقُ التشريح هنا، ويستهلكه المستدعيان.**
 *
 * ── وثمنُه معلَنٌ ويُتابَع (`ق-٤٠٥`) ─────────────────────────────────────
 *
 * ⚠️ **ترتيبُ التشغيل يُحفَظ داخل الشريحة لا عبرها**: مجموعةٌ تعتمد على أخرى
 * في شريحةٍ ثانية **لا تُكتشف**. **فشريحةٌ واحدة تُشغَّل دورياً**، وأوّلُها
 * على المضيف الجديد.
 */

/**
 * ⚠️ **ولا تُشرَّح حزمةٌ أصغر من شرائحها**: أربعُ شرائحَ على ملفَّين تترك
 * **شريحتين فارغتين**، **وجيست يُخرجهما `EMPTY`** — **فيصير الحكمُ `EMPTY`
 * والحزمةُ خضراء**. **حمرةٌ كاذبة سببُها التشريحُ لا الشيفرة.**
 */
export function shardCountFor(requested, fileCount) {
  return Math.max(1, Math.min(requested, Math.floor(fileCount / 2)));
}

/** عددُ ملفات الاختبار التي يطابقها الوسيط — يُسأل **قبل** التشريح. */
function listedFiles(jestArgs, env) {
  try {
    return countListedTests(execSync(`npx jest --listTests ${jestArgs}`, { env, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch {
    return 0;
  }
}

/**
 * يُشغّل جيست على شرائح متتابعة ويعيد الحكم المجتمع.
 *
 * ⚠️ **والأشدُّ يُغلِّب** (شرطُ المالك ①): **ثلاثُ شرائحَ خضراء ورابعةٌ لم
 * تكمل ليست نجاحاً** — **فما لم يُشغَّل لا يُقال عنه شيء**.
 */
export async function runShardedJest({ jestArgs, env = process.env, shards = 4, label = 'الحزمة' }) {
  const fileCount = listedFiles(jestArgs, env);
  if (fileCount === 0) return { verdict: 'NO_MATCH', verdicts: [], fileCount: 0, shardCount: 0, capMb: 0, nested: null };

  const shardCount = shardCountFor(shards, fileCount);
  const capMb = heapCapMb(totalmem());
  const shardEnv = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --max-old-space-size=${capMb}`.trim() };
  console.log(`▶ ${label}: ${fileCount} ملفّاً · شرائح ${shardCount} · سقفُ الكومة ${capMb} م.ب (مضيفٌ ${Math.round(totalmem() / 1024 ** 3)} ج.ب)\n`);

  const logPath = join(tmpdir(), `mad-app-shard-log-${process.pid}.txt`);
  const logStream = createWriteStream(logPath);

  const verdicts = [];
  for (let shard = 1; shard <= shardCount; shard += 1) {
    const result = join(tmpdir(), `mad-app-shard-${process.pid}-${shard}.json`);
    const shardArg = shardCount > 1 ? `--shard=${shard}/${shardCount}` : '';
    if (shardCount > 1) console.log(`\n▶ الشريحة ${shard}/${shardCount}\n`);
    // **كلُّ شريحةٍ عمليةُ `node` جديدة** — فالذاكرةُ تعود إلى الصفر بينها.
    const ok = await tee(`npx jest ${shardArg} --json --outputFile="${result}" ${jestArgs}`, shardEnv, logStream);
    verdicts.push(verdictOf(result, !ok));
    rmSync(result, { force: true });
  }
  await new Promise((resolve) => logStream.end(resolve));

  const verdict = combineVerdicts(verdicts);
  if (shardCount > 1) console.log(`\n▶ أحكامُ الشرائح: ${verdicts.join(' · ')} ⇒ ${verdict}`);

  /**
   * ⭐ **بلاغاتُ المعاملة المتداخلة تُقرأ في كل تشغيل** (`ق-٤١٥`②).
   *
   * ⚠️ **والغريبُ وحده يُدين**: حالاتُ الكاشف الموجبة **تُبلّغ بحكم بنائها** —
   * **وحارسٌ لا يُبلّغ عن نفسه حارسٌ لا يعمل**. **فيُنسب كلُّ بلاغٍ إلى مصدره
   * من أثره**، والاستثناءُ **يسمّي الملفَّ صراحةً لا بنمط**.
   */
  const nested = nestedReports(readFileSync(logPath, 'utf8'));
  rmSync(logPath, { force: true });
  if (nested.total > 0) {
    console.log(`\n▶ بلاغاتُ المعاملة المتداخلة: ${nested.total} — منها ${nested.own} من «${PROBE_OWN_SPEC}» و${nested.foreign} من غيره`);
    if (nested.foreign > 0) {
      console.error(`⚠️ ${nested.foreign} بلاغاً من مسارٍ تطبيقيّ — معاملةٌ داخل معاملة تمسك اتصالين، فاقرأ أثرَها في المخرَج أعلاه.`);
    }
  }

  return { verdict, verdicts, fileCount, shardCount, capMb, nested };
}

/**
 * ⭐ **المخرَجُ يُبَثّ ويُحفظ معاً** (`ق-٤١٦`).
 *
 * ⚠️ **ولماذا لا `execSync`**: `stdio: 'inherit'` **يبثّ ولا يحفظ**، فلا يبقى
 * نصٌّ يُعدّ منه البلاغ؛ و`pipe` **يحفظ ولا يبثّ**، **فتصمت شريحةٌ تركض
 * دقائق** — وهو ما يجعل الانقطاعَ لا يُرى وقتَ وقوعه. **فيُبَثّ ويُحفظ**.
 */
function tee(command, env, logStream) {
  return new Promise((resolve) => {
    // ⚠️ **أمرٌ واحدٌ مع `shell: true` لا مصفوفةَ وسائط**: تمريرُ المصفوفة مع
    //    الصدفة **يُلصقها بلا تهريب** — و`node` يحذّر منه صراحةً (`DEP0190`).
    const child = spawn(command, { env, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        process.stdout.write(chunk);
        logStream.write(chunk);
      });
    }
    child.on('close', (code) => resolve(code === 0));
  });
}
