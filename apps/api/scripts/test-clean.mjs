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

const DB = process.env.TEST_CLEAN_DB ?? 'mad_app_clean';
const SUPER = process.env.TEST_CLEAN_SUPERUSER ?? 'mad_app';
const CONTAINER = process.env.TEST_CLEAN_CONTAINER ?? 'mad-app-postgres-1';
const pattern = process.argv.slice(2);

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
try {
  run(`npx jest --runInBand ${pattern.join(' ')}`);
  console.log('\n✔ الحزمة تخضرّ على قاعدة نظيفة.');
} catch {
  console.error('\n✘ سقطت على قاعدة نظيفة — اعتماديةٌ خفية على حالةٍ متراكمة.');
  console.error('  المجموعة الساقطة تفترض ما لم تصنعه. اجعلها تهيّئ ما تحتاجه في beforeAll.');
  process.exit(1);
}
