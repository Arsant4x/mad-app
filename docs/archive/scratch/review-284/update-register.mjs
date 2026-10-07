// يحدّث سجلّ النطاق في مكانه بأرقامٍ ثابتة (لا يُعاد ترقيم):
//   edits.tsv:  الرقم · الحال الجديد|فارغ · الاسم الجديد|فارغ · الشرح الجديد|فارغ · مراجعُ تُضاف|فارغ · مراجعُ تُحذف|فارغ
//   adds.tsv:   الباب · الاسم · الشرح · الحال · المراجع   (يأخذ الرقمَ التالي ويُوضع آخرَ بابه)
// ثم يعيد عدَّ الأحوال والأبواب في رأس الملفّ.
// الاستعمال: node update-register.mjs <السجلّ> <edits.tsv> [adds.tsv]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [regPath, editsPath, addsPath] = process.argv.slice(2);
const STATES = ['مبنيّ', 'قيد البناء', 'ينتظر قرار صاحب المشروع', 'مسجَّل', 'مُسح', 'مؤجَّل', 'مستبعَد', 'غير محسوم'];
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const fromAr = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const raw = readFileSync(regPath, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);
const ITEM = /^\* ([٠-٩]+)\. \*\*(.+?)\*\* · (.*) · \*\*([^*]+)\*\* · (.*)$/;
const idx = new Map();
lines.forEach((l, i) => { const m = ITEM.exec(l); if (m) idx.set(fromAr(m[1]), i); });
const problems = [];
const log = [];
const rd = (p) => (p && existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t')) : []);
for (const [num, st, name, expl, add, del] of rd(editsPath)) {
  const n = fromAr(num);
  const i = idx.get(n);
  if (i === undefined) { problems.push('لا بند ' + num); continue; }
  const m = ITEM.exec(lines[i]);
  let [, , oName, oExpl, oSt, oRef] = m;
  if (st && !STATES.includes(st)) { problems.push('حال؟ ' + num + ' ' + st); continue; }
  let refs = oRef.split(' · ').map((s) => s.trim()).filter(Boolean);
  if (del) for (const d of del.split(' · ')) refs = refs.filter((r) => r !== d.trim());
  if (add) for (const a of add.split(' · ')) if (!refs.includes(a.trim())) refs.push(a.trim());
  const nl = `* ${toAr(n)}. **${name || oName}** · ${expl || oExpl} · **${st || oSt}** · ${refs.join(' · ')}`;
  if (nl !== lines[i]) log.push(`${num}: ${oSt}${st && st !== oSt ? ' ⟵ ' + st : ''}`);
  lines[i] = nl;
}
let next = Math.max(...idx.keys()) + 1;
for (const [sec, name, expl, st, refs] of rd(addsPath)) {
  if (!STATES.includes(st)) { problems.push('حال؟ إضافة ' + name); continue; }
  const h = lines.findIndex((l) => l.startsWith('## ') && l.includes(sec));
  if (h < 0) { problems.push('باب؟ ' + sec); continue; }
  let j = h + 1;
  while (j < lines.length && !lines[j].startsWith('## ')) j++;
  while (j > h + 1 && lines[j - 1].trim() === '') j--;
  lines.splice(j, 0, `* ${toAr(next)}. **${name}** · ${expl} · **${st}** · ${refs}`);
  log.push(`+${toAr(next)}: ${name} (${st})`);
  next++;
}
// إعادةُ العدّ في الرأس
const items = lines.map((l) => ITEM.exec(l)).filter(Boolean);
const count = (st) => items.filter((m) => m[4] === st).length;
const total = items.length;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('* **المجموع:')) lines[i] = `* **المجموع: ${toAr(total)} بنداً**`;
  for (const st of STATES) if (lines[i] === `* ${st}: ` + lines[i].slice(`* ${st}: `.length) && lines[i].startsWith(`* ${st}: `) && /^[٠-٩]+$/.test(lines[i].slice(`* ${st}: `.length))) lines[i] = `* ${st}: ${toAr(count(st))}`;
}
// العددُ بالأبواب
let sec = null;
const perSec = new Map();
for (const l of lines) {
  if (l.startsWith('## ')) sec = l.replace(/^## [٠-٩]+\. /, '');
  const m = ITEM.exec(l);
  if (m && sec) { const o = perSec.get(sec) || { t: 0, b: 0 }; o.t++; if (m[4] === 'مبنيّ') o.b++; perSec.set(sec, o); }
}
for (let i = 0; i < lines.length; i++) {
  const m = /^\* ([٠-٩]+)\. (.+): [٠-٩]+، المبنيُّ منها [٠-٩]+$/.exec(lines[i]);
  if (m && perSec.has(m[2])) { const o = perSec.get(m[2]); lines[i] = `* ${m[1]}. ${m[2]}: ${toAr(o.t)}، المبنيُّ منها ${toAr(o.b)}`; }
}
if (total === 0 || idx.size === 0) throw new Error('لا بندَ مقروءاً، فلا كتابة');
writeFileSync(regPath, lines.join(EOL));
console.log(`total=${total} changed=${log.length} problems=${problems.length}`);
console.log(JSON.stringify(Object.fromEntries(STATES.map((s) => [s, count(s)]))));
for (const l of log) console.log('  ' + l);
for (const p of problems) console.log('✖ ' + p);
