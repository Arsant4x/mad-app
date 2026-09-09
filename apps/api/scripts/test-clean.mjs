/**
 * حارس دائم: يشغّل الحزمة على قاعدة **أُنشئت من الصفر**.
 *
 * لماذا يوجد: `80/469` سُجِّلت شهوراً وهي رقمٌ من قاعدة تطويرٍ تحمل حالة
 * متراكمة. أول تشغيلٍ على قاعدة نظيفة أعطى `77/448` — لأن ثلاث مجموعات
 * كانت تنجح **فقط إن سبقتها** مجموعةٌ تكتب ملف المنشأة.
 *
 * ⭐ القاعدة: حزمةٌ تعتمد على ترتيب التشغيل ليست حزمة اختبار بل **صدفة
 * منظَّمة**. وما لا يُقاس ينحدر — فهذا السكربت يجعل «تخضرّ على النظيف»
 * قابلاً للقياس بأمرٍ واحد بدل أن يبقى نيّةً حسنة.
 *
 *   node scripts/test-clean.mjs            كل الحزمة
 *   node scripts/test-clean.mjs zatca      نمطٌ بعينه
 *
 * يتطلب أن تكون حاويات التطوير تعمل (docker compose up -d).
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { combineVerdicts, countListedTests, heapCapMb, verdictOf } from './clean-verdict.mjs';

const DB = process.env.TEST_CLEAN_DB ?? 'mad_app_clean';
const SUPER = process.env.TEST_CLEAN_SUPERUSER ?? 'mad_app';
const CONTAINER = process.env.TEST_CLEAN_CONTAINER ?? 'mad-app-postgres-1';
const pattern = process.argv.slice(2);

/**
 * ⭐ **الشرائحُ تُعيد الذاكرة إلى الصفر بين الأجزاء** (`ق-٤٠٢`).
 *
 * ── العطل الذي بُنيت له ──────────────────────────────────────────────────
 *
 * `--runInBand` يُشغّل الحزمة كلَّها **في عمليةِ `node` واحدة**، وكلُّ مجموعةِ
 * `e2e` تُقلع `AppModule` ومحرّكَ Prisma. **فالذاكرةُ تتراكم عبر ١٣٠ مجموعة**،
 * **وتنقطع الحزمةُ قبل أن تكمل** — مرّتين في يومٍ واحد:
 *
 *   · سقفُ `V8` عند `6144` على مضيفٍ سعتُه `7.79 GB` ⇒ **٢٧ مجموعة**.
 *   · وبعد خفضه إلى `2560` ⇒ **٦٢ مجموعة**.
 *
 * **والرسالةُ `memory allocation … failed` مُخصِّصُ `Rust`** — أي **محرّكُ
 * Prisma لا كومةُ `V8`**: **المضيفُ نفدَ لا الكومة**. ⇒ **فخفضُ السقف وحده
 * يؤجّل الانقطاع ولا يمنعه**، لأن ما يتراكم **خارج الكومة** كذلك.
 *
 * ⚠️ **وانقطاعٌ ليس نتيجةً سيّئة بل لا نتيجة**: «**حزمةٌ تنقطع تُبطل كلَّ
 * قياسٍ بعدها**» (حكمُ المالك) — **وكلُّ مجموعةٍ سقطت قبل الانقطاع تبعيّة**:
 * أربعٌ فُحصت وحدَها على قاعدةٍ نظيفة **فخضرَّت كلُّها**.
 *
 * ── وثمنُها معلَن ────────────────────────────────────────────────────────
 *
 * ⚠️ **القاعدةُ تُنشأ مرّةً واحدة** — فالحالةُ المتراكمة تُقاس كما كانت.
 * **لكنّ ترتيبَ التشغيل يُحفَظ داخل الشريحة لا عبرها**: مجموعةٌ تعتمد على
 * أخرى في شريحةٍ أخرى **لن تُكتشف هنا**. ⇒ **وهذا إضعافٌ يُعلَن**: شريحةٌ
 * واحدة (`TEST_CLEAN_SHARDS=1`) تبقى الأقوى، **وتُستعمل حين يتّسع المضيف**.
 */
const SHARDS = Number(process.env.TEST_CLEAN_SHARDS ?? 4);

const psql = (db, sql) =>
  execSync(`docker exec -u postgres ${CONTAINER} psql -U ${SUPER} -d ${db} -v ON_ERROR_STOP=1 -c "${sql}"`, { stdio: 'pipe' }).toString();

function step(label, fn) {
  process.stdout.write(`▶ ${label}… `);
  try {
    const out = fn();
    console.log('✔');
    return out;
  } catch (e) {
    console.log('✘');
    // الرسالة كاملة: حارسٌ يفشل صامتاً يُقرأ نجاحاً.
    console.error(String(e.stderr ?? e.message ?? e).trim().split('\n').slice(-6).join('\n'));
    process.exit(1);
  }
}

step(`إسقاط ${DB} وإنشاؤها من الصفر`, () => {
  psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  psql('postgres', `CREATE DATABASE ${DB} OWNER app_user`);
  psql(DB, 'ALTER SCHEMA public OWNER TO app_user');
});

// نفس DATABASE_URL لكن على القاعدة النظيفة — لا يمسّ قاعدة التطوير إطلاقاً.
const base = process.env.DATABASE_URL;
if (!base) {
  console.error('✘ DATABASE_URL غير مضبوط — انسخ .env.test.example إلى .env.test');
  process.exit(1);
}
const cleanUrl = base.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);
const env = { ...process.env, DATABASE_URL: cleanUrl };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

step('الهجرات', () => execSync('npx prisma migrate deploy', { stdio: 'pipe', env }));
step('البذرة', () => execSync('npx prisma db seed', { stdio: 'pipe', env }));

console.log(`\n▶ الحزمة على ${DB} (قاعدة عمرها ثوانٍ — هذا ما يواجهه CI)\n`);

// ⚠️ **حصيلةٌ تُكتب بعد الاكتمال وحده** (`ق-٣٣٤`): وجودُها صالحةً هو «سطرُ
// النتيجة»، **وغيابُها انقطاعٌ لا فشل**. و`--json` **لا يُخفي المخرَج الحيّ**
// — قِيس: الملخّصُ يُطبع كما كان والملفُّ يُكتب معه.
// ⚠️ **ويُسأل النمطُ قبل التشغيل** (`ق-٣٣٤`): نمطٌ لا يطابق شيئاً يُخرج جيست
// بغير صفرٍ **بلا حصيلة** — فيبدو انقطاعاً، **فتُبتلع حالةُ «صفرُ اختبار»**.
const listed = (() => {
  try {
    return execSync(`npx jest --listTests ${pattern.join(' ')}`, { env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
})();
const fileCount = countListedTests(listed);
if (fileCount === 0) {
  console.error(`\n✘ النمط «${pattern.join(' ') || '(الكل)'}» لا يطابق ملفَّ اختبارٍ واحداً — فصفرُ اختبارٍ ليس نجاحاً ولا انقطاعاً.`);
  process.exit(1);
}

/**
 * ⚠️ **ولا تُشرَّح حزمةٌ أصغر من شرائحها** (`ق-٤٠٢`): أربعُ شرائحَ على ملفَّين
 * تترك **شريحتين فارغتين**، **وجيست يُخرجهما `EMPTY`** — **فيصير الحكمُ
 * `EMPTY` والحزمةُ خضراء**. وهي خضرةٌ كاذبةٌ مقلوبة: **حمرةٌ كاذبة تُنسب إلى
 * الشيفرة وسببُها التشريح**.
 *
 * **فالشرائحُ تُحدّ بعدد الملفات**: ملفّان لكل شريحةٍ على الأقلّ.
 */
const shardCount = Math.max(1, Math.min(SHARDS, Math.floor(fileCount / 2)));

/**
 * ⚠️ **السقفُ يُشتقّ من المضيف ولا يُترك** (`ق-٤٠٢`): رقمٌ ثابتٌ يناسب جهازاً
 * **يقتل جهازاً أصغر ويُهدر أكبر**. **ويُطبع كي يُقرأ مع النتيجة** — فمن يقرأ
 * انقطاعاً بعد شهر يحتاج أن يعرف تحت أيّ سقفٍ وقع.
 */
const capMb = heapCapMb(totalmem());
const shardEnv = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --max-old-space-size=${capMb}`.trim() };
console.log(`▶ سقفُ الكومة ${capMb} م.ب (مضيفٌ ${Math.round(totalmem() / 1024 ** 3)} ج.ب) · شرائح: ${shardCount}\n`);

const verdicts = [];
for (let shard = 1; shard <= shardCount; shard += 1) {
  const RESULT = join(tmpdir(), `mad-app-clean-result-${process.pid}-${shard}.json`);
  // **كلُّ شريحةٍ عمليةُ `node` جديدة** — فالذاكرةُ تعود إلى الصفر بينها،
  // **وهو الفرقُ الذي يجعل الحزمة تكمل**.
  const shardArg = shardCount > 1 ? `--shard=${shard}/${shardCount}` : '';
  if (shardCount > 1) console.log(`\n▶ الشريحة ${shard}/${shardCount}\n`);
  let threw = false;
  try {
    execSync(`npx jest --runInBand ${shardArg} --json --outputFile="${RESULT}" ${pattern.join(' ')}`, { stdio: 'inherit', env: shardEnv });
  } catch {
    threw = true;
  }
  verdicts.push(verdictOf(RESULT, threw));
  rmSync(RESULT, { force: true });
}

const verdict = combineVerdicts(verdicts);
if (shardCount > 1) console.log(`\n▶ أحكامُ الشرائح: ${verdicts.join(' · ')} ⇒ ${verdict}`);

if (verdict === 'INTERRUPTED') {
  // 🔴 **انقطاعٌ لا نتيجة**: لا حصيلةَ أصلاً، فلا يُنسب شيءٌ إلى الشيفرة.
  console.error('\n⛔ انقطاع — لا نتيجة. الحزمةُ لم تكمل، فلا حكمَ على الشيفرة.');
  console.error('  ولا تقرأه فشلاً: تشغيلٌ سابق سقط هكذا وسببُه كان **إعادةَ تشغيل محرّك الحاويات**');
  console.error('  من تحت الحزمة (توقّفٌ نظيف وبدءٌ بعده بثانيتين، بلا OOM وبلا انهيار).');
  console.error('  اقرأ السبب قبل أن تنسبه: docker inspect mad-app-postgres-1 --format "{{.State.StartedAt}} {{.State.OOMKilled}} {{.RestartCount}}"');
  console.error('  ثم أعد التشغيل — فالانقطاعُ يُعاد ولا يُصلَح في الشيفرة.');
  process.exit(2);
}

if (verdict === 'EMPTY') {
  // ⚠️ **خضرةٌ لا تعني شيئاً**: الحزمةُ اكتملت ولم يركض توكيدٌ واحد.
  console.error('\n✘ لم يركض توكيدٌ واحد — والحزمةُ اكتملت. فخضرةٌ بلا تشغيلٍ ليست نجاحاً.');
  console.error('  راجع مرشّح الاسم (-t) أو النمط: كلُّ الاختبارات تُخطّيت.');
  process.exit(1);
}

if (verdict === 'FAIL') {
  console.error('\n✘ سقطت على قاعدة نظيفة — اعتماديةٌ خفية على حالةٍ متراكمة.');
  console.error('  المجموعة الساقطة تفترض ما لم تصنعه. اجعلها تهيّئ ما تحتاجه في beforeAll.');
  process.exit(1);
}

console.log('\n✔ الحزمة تخضرّ على قاعدة نظيفة.');
