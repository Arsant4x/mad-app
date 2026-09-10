import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { combineVerdicts, countListedTests, heapCapMb, verdictOf } from './clean-verdict.mjs';

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
export function runShardedJest({ jestArgs, env = process.env, shards = 4, label = 'الحزمة' }) {
  const fileCount = listedFiles(jestArgs, env);
  if (fileCount === 0) return { verdict: 'NO_MATCH', verdicts: [], fileCount: 0, shardCount: 0, capMb: 0 };

  const shardCount = shardCountFor(shards, fileCount);
  const capMb = heapCapMb(totalmem());
  const shardEnv = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --max-old-space-size=${capMb}`.trim() };
  console.log(`▶ ${label}: ${fileCount} ملفّاً · شرائح ${shardCount} · سقفُ الكومة ${capMb} م.ب (مضيفٌ ${Math.round(totalmem() / 1024 ** 3)} ج.ب)\n`);

  const verdicts = [];
  for (let shard = 1; shard <= shardCount; shard += 1) {
    const result = join(tmpdir(), `mad-app-shard-${process.pid}-${shard}.json`);
    const shardArg = shardCount > 1 ? `--shard=${shard}/${shardCount}` : '';
    if (shardCount > 1) console.log(`\n▶ الشريحة ${shard}/${shardCount}\n`);
    let threw = false;
    try {
      // **كلُّ شريحةٍ عمليةُ `node` جديدة** — فالذاكرةُ تعود إلى الصفر بينها.
      execSync(`npx jest ${shardArg} --json --outputFile="${result}" ${jestArgs}`, { stdio: 'inherit', env: shardEnv });
    } catch {
      threw = true;
    }
    verdicts.push(verdictOf(result, threw));
    rmSync(result, { force: true });
  }

  const verdict = combineVerdicts(verdicts);
  if (shardCount > 1) console.log(`\n▶ أحكامُ الشرائح: ${verdicts.join(' · ')} ⇒ ${verdict}`);
  return { verdict, verdicts, fileCount, shardCount, capMb };
}
