// يستخرج صفوفَ السجلّ المرقّمة إلى دفعاتٍ للتصنيف: الرقم · السطر · العنوان · مقتطفُ الحكم · الحالة.
// الاستعمال: node extract-rows.mjs <decisions.md> <مجلّد الإخراج> <حجم الدفعة>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [src, outDir, sizeArg] = process.argv.slice(2);
const size = Number(sizeArg || 210);
const lines = readFileSync(src, 'utf8').split(/\r?\n/);
const ID = /ق-([٠-٩0-9]+)/;
const rows = [];
lines.forEach((l, i) => {
  if (!l.startsWith('| **')) return;
  const cells = l.split(' | ');
  const first = cells[0].replace(/^\|\s*/, '');
  const m = first.match(ID);
  if (!m) return;
  const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  rows.push({
    id: m[1],
    line: i + 1,
    title: clip(first, 300),
    ruling: clip(cells[1], 700),
    why: clip(cells[2], 350),
    status: clip(cells[cells.length - 1].replace(/\|\s*$/, ''), 120),
  });
});
mkdirSync(outDir, { recursive: true });
let b = 0;
for (let k = 0; k < rows.length; k += size) {
  b++;
  writeFileSync(join(outDir, `batch-${String(b).padStart(2, '0')}.json`), JSON.stringify(rows.slice(k, k + size), null, 1));
}
console.log(`rows=${rows.length} batches=${b} uniqueIds=${new Set(rows.map((r) => r.id)).size}`);
