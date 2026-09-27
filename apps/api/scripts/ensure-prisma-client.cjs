// ⚖️ ق-١٥٠٤ (ب٢) — postinstall: يُعيد توليدَ عميل Prisma في هذه النسخة بعد التثبيت.
//
// لماذا: العميلُ يُولَّد داخل apps/api/node_modules/@mad-app/db، و`npm ci` **يمحو** apps/api/node_modules — مقيسٌ على
// npm 11.16.0 في مساحة عملٍ تجريبية (`npm install` يُبقيه، و`npm ci` يحذفه، وpostinstall مساحةِ العمل يجري في الاثنين).
// فبلا هذا يخرج `npm ci` أخضرَ ويسقط أوّلُ تشغيلٍ بـMODULE_NOT_FOUND.
//
// ويُستدعى من postinstall **إن وُجد هذا الملفّ** (package.json): فطبقةُ الاعتماديات في Dockerfile الخادم وصورةُ الواجهة —
// وكلتاهما تُثبّت مساحةَ العمل قبل نسخ apps/api — تتخطّيانه (أسقط `nginx-cache` نسخةً كانت تستدعيه بلا شرط:
// «Cannot find module '/app/apps/api/scripts/ensure-prisma-client.cjs'»). وحيث يوجد الملفّ بلا مخطّطٍ يتخطّى أيضاً.
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { execSync } = require('node:child_process');

const apiRoot = join(__dirname, '..');
const schema = join(apiRoot, 'prisma', 'schema.prisma');

if (!existsSync(schema)) {
  console.log('ensure-prisma-client: لا مخطّطَ هنا (طبقةُ الاعتماديات) — يُتخطّى، والتوليدُ بعد نسخ المصدر');
  process.exit(0);
}

console.log('ensure-prisma-client: يُولَّد عميلُ Prisma لهذه النسخة (apps/api/node_modules/@mad-app/db) …');
execSync('npx prisma generate', { cwd: apiRoot, stdio: 'inherit' });
