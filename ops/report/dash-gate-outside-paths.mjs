// بوّابةُ الشَّرطات خارج المسارات: تحذف ما بين علامتي `…` ثم تعدّ الشَّرطات كبوّابة ٢٦٩ نفسِها.
// الغرض: إثباتُ أن كلَّ شَرطةٍ باقية داخل اسمِ مسارٍ أو عنوانٍ كما هو على القرص. مصادَقةٌ: --self
import { readFileSync } from 'node:fs';

const DASH = /[-‐‑‒–—―−﹘﹣－⸺⸻]/;
const strip = (l) => l.replace(/`[^`]*`/g, '');
function scan(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const s = strip(l);
    const m = s.match(DASH);
    if (m) hits.push(`${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase()} ${s.slice(Math.max(0, m.index - 30), m.index + 30)}`);
  });
  return hits;
}
if (process.argv[2] === '--self') {
  const a = scan('نصٌّ فيه شَرطةٌ خارج المسار - هنا و`D:\\mad-app`');
  const b = scan('نصٌّ نظيف ومسارٌ فيه شَرطة `D:\\mad-app-backups\\x-y.md`');
  console.log(`يجب أن يجد: ${a.length} · يجب ألّا يجد: ${b.length}`);
  process.exit(a.length === 1 && b.length === 0 ? 0 : 2);
}
let total = 0;
for (const f of process.argv.slice(2)) {
  const hits = scan(readFileSync(f, 'utf8'));
  total += hits.length;
  console.log(`${f}: ${hits.length}`);
  for (const h of hits.slice(0, 40)) console.log('  ' + h);
}
process.exit(total ? 1 : 0);
